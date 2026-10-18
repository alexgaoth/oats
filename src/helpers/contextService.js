// The team's context for the context check (contextCheck.mjs), on this Mac:
// the Markdown and text files of one folder, and the conversations already
// recorded here.
//
// "Shared" is the folder's job, not Oats's: point it at a folder the team
// already keeps in sync (a git repository of docs, a Drive or Dropbox folder,
// an Obsidian vault) and everyone's Oats reads the same context. Nothing here
// talks to a network. The files are read from disk, cut into passages and
// indexed by word in memory (contextIndex.mjs), and a file that changes is
// read again on its own, so the context is current while a conversation runs.
//
// Past conversations come from the notes database: full-text search narrows
// them to a few, and their summaries and transcripts are ranked the same way
// as the files. The conversation being recorded is left out, because its own
// reply would otherwise be found and "confirm" itself.
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const debugLogger = require("./debugLogger");

/** The files that are read. Anything else in the folder is left alone. */
const EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".txt"]);

/** Folders that hold machinery, not notes. Hidden folders are skipped too. */
const SKIPPED_DIRS = new Set(["node_modules", "dist", "build"]);

/** Enough for a team's docs; a folder past this is not a folder of notes. */
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 512 * 1024;

/** Saves arrive as bursts of events; one read per burst. */
const CHANGE_DEBOUNCE_MS = 400;

/** Past conversations read for one question, after full-text search. */
const CANDIDATE_CONVERSATIONS = 6;

/** A transcript passage is a run of turns up to about this many characters. */
const TURN_WINDOW_CHARS = 420;

/** Passages handed to the judge. */
const RESULT_LIMIT = 4;

// A conversation Oats wrote into a vault says so in its frontmatter
// (obsidianVault.js). The database already holds it, with its real
// transcript, so the mirror is not indexed a second time.
const OATS_ID = /^oats_id:\s*\d+\s*$/m;

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

let indexLib = null;
const loadIndexLib = async () => {
  indexLib = indexLib || (await import("./contextIndex.mjs"));
  return indexLib;
};

function eligible(name) {
  return EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** The date a conversation was recorded, as the judge reads it: 2026-10-14. */
function dayOf(createdAt) {
  const date = new Date(
    String(createdAt || "").replace(" ", "T") + (/[zZ+]/.test(createdAt) ? "" : "Z")
  );
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** A transcript, as runs of consecutive turns. */
function transcriptPassages(row) {
  let segments;
  try {
    segments = JSON.parse(row.transcript || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(segments)) return [];
  const passages = [];
  let run = [];
  let size = 0;
  const flush = () => {
    const text = run.join(" ").trim();
    if (text) {
      passages.push({
        id: `conversation:${row.id}:t${passages.length}`,
        docId: `conversation:${row.id}`,
        title: row.title || "",
        heading: "",
        text,
      });
    }
    run = [];
    size = 0;
  };
  for (const segment of segments) {
    const text = String(segment?.text || "").trim();
    if (!text) continue;
    if (size && size + text.length > TURN_WINDOW_CHARS) flush();
    run.push(text);
    size += text.length + 1;
  }
  flush();
  return passages;
}

class ContextService {
  constructor({ databaseManager } = {}) {
    this.databaseManager = databaseManager || null;
    this.folder = null;
    this.index = null;
    this.docs = new Set();
    this.watcher = null;
    this.timers = new Map();
    this.building = null;
    this.generation = 0;
    this.error = null;
    this.truncated = false;
  }

  /**
   * Points the service at a folder, or at none. Indexing runs in the
   * background; a search while it runs reads whatever is indexed so far.
   *
   * @param {{ folder?: string | null }} config
   */
  async configure({ folder } = {}) {
    const next = folder ? path.resolve(String(folder)) : null;
    if (next === this.folder && (this.index || !next)) return this.status();
    this._stop();
    this.folder = next;
    this.error = null;
    this.truncated = false;
    if (!next) return this.status();

    const lib = await loadIndexLib();
    const generation = ++this.generation;
    this.index = lib.createContextIndex();
    this.docs = new Set();
    this.building = this._build(generation).finally(() => {
      if (generation === this.generation) this.building = null;
    });
    this._watch(generation);
    return this.status();
  }

  status() {
    return {
      folder: this.folder,
      files: this.docs.size,
      passages: this.index?.size ?? 0,
      indexing: Boolean(this.building),
      truncated: this.truncated,
      error: this.error,
    };
  }

  /** Whether `relPath` names a file inside the folder (and not outside it). */
  resolveInside(relPath) {
    if (!this.folder || typeof relPath !== "string" || !relPath) return null;
    const target = path.resolve(this.folder, relPath);
    const relative = path.relative(this.folder, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return target;
  }

  /**
   * The passages most likely to settle `question`, best first, from the folder
   * and from past conversations. Empty when nothing matches strongly enough
   * to be worth a judge's time (contextIndex.mjs, `isStrongMatch`).
   *
   * @param {{ question: string, noteId?: number | null }} query
   */
  async search({ question, noteId = null } = {}) {
    const lib = await loadIndexLib();
    const text = String(question || "").trim();
    if (!text) return [];
    const results = [];
    if (this.index) {
      for (const result of this.index.search(text, RESULT_LIMIT * 2)) {
        results.push({ ...result, source: this._fileSource(result.passage) });
      }
    }
    for (const result of this._conversationResults(lib, text, noteId)) results.push(result);

    // Scores from two indexes do not compare, but how much of the question a
    // passage covers does. Coverage first, then the score within it.
    return results
      .filter(lib.isStrongMatch)
      .sort((a, b) => b.coverage - a.coverage || b.score - a.score)
      .slice(0, RESULT_LIMIT)
      .map(({ passage, source }) => ({
        id: passage.id,
        label: source.label,
        text: passage.text,
        source,
      }));
  }

  _fileSource(passage) {
    const relPath = passage.docId;
    return {
      kind: "file",
      path: relPath,
      heading: passage.heading || "",
      label: passage.heading
        ? `${path.basename(relPath)}, ${passage.heading}`
        : path.basename(relPath),
    };
  }

  _conversationResults(lib, question, noteId) {
    const db = this.databaseManager?.db;
    if (!db) return [];
    // FTS5 matches the start of a word, so each word is a prefix, and any of
    // them may match: the ranking below decides, not the database.
    const terms = [...new Set(lib.tokenize(question))].filter(
      (term) => !/[\u3040-\u9fff]/u.test(term)
    );
    if (!terms.length) return [];
    const match = terms.map((term) => `"${term.replace(/"/g, '""')}"*`).join(" OR ");
    let rows;
    try {
      rows = db
        .prepare(
          `SELECT n.id, n.title, n.enhanced_content, n.transcript, n.created_at
           FROM notes n
           JOIN notes_fts ON notes_fts.rowid = n.id
           WHERE notes_fts MATCH ? AND n.deleted_at IS NULL AND n.note_type = 'meeting'
             AND n.sample_id IS NULL AND n.id != ?
           ORDER BY notes_fts.rank
           LIMIT ?`
        )
        .all(match, Number.isInteger(noteId) ? noteId : -1, CANDIDATE_CONVERSATIONS);
    } catch (error) {
      debugLogger.debug("Context: conversation search failed", { error: error.message }, "context");
      return [];
    }
    if (!rows.length) return [];

    const index = lib.createContextIndex();
    const sources = new Map();
    for (const row of rows) {
      const docId = `conversation:${row.id}`;
      const title = row.title || "";
      const summary = lib
        .chunkDocument(row.enhanced_content || "", { docId: `${docId}:s`, title })
        .map((passage) => ({ ...passage, docId }));
      index.setDoc(docId, [...summary, ...transcriptPassages(row)]);
      const day = dayOf(row.created_at);
      sources.set(docId, {
        kind: "conversation",
        noteId: row.id,
        title,
        day,
        label: day ? `${title} (${day})` : title,
      });
    }
    return index
      .search(question, RESULT_LIMIT * 2)
      .map((result) => ({ ...result, source: sources.get(result.passage.docId) }));
  }

  async _build(generation) {
    const lib = await loadIndexLib();
    const root = this.folder;
    const queue = [""];
    let read = 0;
    while (queue.length && generation === this.generation) {
      const dir = queue.shift();
      let entries;
      try {
        entries = await fsp.readdir(path.join(root, dir), { withFileTypes: true });
      } catch (error) {
        if (!dir) {
          this.error = error.code === "ENOENT" ? "missing" : "unreadable";
          return;
        }
        continue;
      }
      for (const entry of entries) {
        if (generation !== this.generation) return;
        if (entry.name.startsWith(".")) continue;
        const relPath = dir ? `${dir}/${entry.name}` : entry.name;
        // Symbolic links are not followed: a link back up the tree would
        // walk forever, and one out of the folder reads what was not shared.
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRS.has(entry.name)) queue.push(relPath);
        } else if (entry.isFile() && eligible(entry.name)) {
          if (this.docs.size >= MAX_FILES) {
            this.truncated = true;
            return;
          }
          await this._readFile(lib, relPath, generation);
          read += 1;
          // Indexing yields often: the main process is also carrying a
          // recording, and a large folder must never make it stutter.
          if (read % 20 === 0) await yieldToEventLoop();
        }
      }
    }
    debugLogger.info(
      "Context folder indexed",
      { files: this.docs.size, passages: this.index?.size ?? 0, truncated: this.truncated },
      "context"
    );
  }

  async _readFile(lib, relPath, generation) {
    const full = path.join(this.folder, relPath);
    try {
      const stat = await fsp.lstat(full);
      // The folder can change while a read is in flight; what was read for
      // the old one must not land in the new one's index.
      if (generation !== this.generation) return;
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        this._forget(relPath);
        return;
      }
      const text = await fsp.readFile(full, "utf8");
      if (generation !== this.generation) return;
      if (OATS_ID.test(text.slice(0, 512))) {
        this._forget(relPath);
        return;
      }
      this.index.setDoc(
        relPath,
        lib.chunkDocument(text, { docId: relPath, title: path.basename(relPath) })
      );
      this.docs.add(relPath);
    } catch {
      if (generation === this.generation) this._forget(relPath);
    }
  }

  _forget(relPath) {
    if (!this.index) return;
    this.index.removeDoc(relPath);
    this.docs.delete(relPath);
  }

  _watch(generation) {
    try {
      this.watcher = fs.watch(this.folder, { recursive: true }, (eventType, filename) => {
        if (!filename || generation !== this.generation) return;
        const relPath = String(filename).split(path.sep).join("/");
        if (relPath.split("/").some((part) => part.startsWith("."))) return;
        clearTimeout(this.timers.get(relPath));
        this.timers.set(
          relPath,
          setTimeout(() => {
            this.timers.delete(relPath);
            void this._changed(generation, relPath);
          }, CHANGE_DEBOUNCE_MS)
        );
      });
      this.watcher.on("error", (error) => {
        debugLogger.debug("Context folder watch failed", { error: error.message }, "context");
      });
    } catch (error) {
      // Without a watcher the index is still right as of the last configure;
      // it just will not follow edits until the folder is chosen again.
      debugLogger.debug("Context folder watch unavailable", { error: error.message }, "context");
    }
  }

  async _changed(generation, relPath) {
    if (generation !== this.generation || !this.index) return;
    const lib = await loadIndexLib();
    let stat = null;
    try {
      stat = await fsp.lstat(path.join(this.folder, relPath));
    } catch {
      stat = null;
    }
    if (stat?.isFile() && eligible(relPath)) {
      if (this.docs.has(relPath) || this.docs.size < MAX_FILES) {
        await this._readFile(lib, relPath, generation);
      }
      return;
    }
    // Gone, or a folder that was renamed or removed: drop everything under it.
    const prefix = `${relPath}/`;
    for (const docId of [...this.docs]) {
      if (docId === relPath || docId.startsWith(prefix)) this._forget(docId);
    }
    // A folder that appeared (moved in, or renamed): read what is in it.
    if (stat?.isDirectory()) {
      const entries = await fsp
        .readdir(path.join(this.folder, relPath), { recursive: true })
        .catch(() => []);
      for (const name of entries) {
        const child = `${relPath}/${String(name).split(path.sep).join("/")}`;
        if (generation !== this.generation) return;
        if (child.split("/").some((part) => part.startsWith("."))) continue;
        if (eligible(child) && this.docs.size < MAX_FILES)
          await this._readFile(lib, child, generation);
      }
    }
  }

  _stop() {
    this.generation += 1;
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        // Already closed.
      }
    }
    this.watcher = null;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.index = null;
    this.docs = new Set();
    this.building = null;
  }
}

module.exports = { ContextService, transcriptPassages, dayOf };
