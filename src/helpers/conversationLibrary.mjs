// Local conversation tools. Only source coordinates and a hash are persisted:
// removing a source must never leave a second transcript behind.
import { createHash } from "node:crypto";
import { recallText, findExcerpt } from "./conversationRecall.mjs";
import { foldText } from "./searchFold.mjs";
import { parseMoments } from "./conversationMoments.mjs";

const CRITERIA_KEYS = ["query", "groupId", "markedOnly", "openQuestionsOnly"];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function assertFields(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error("Invalid conversation library fields");
  }
}

export function positiveId(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid library id");
  return value;
}

export function libraryName(value) {
  if (typeof value !== "string") throw new Error("Invalid library name");
  const name = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!name || name.length > 80) throw new Error("Library names must contain 1 to 80 characters");
  return name;
}

export function validateCriteria(value) {
  assertFields(value, CRITERIA_KEYS);
  const criteria = {};
  if (own(value, "query")) {
    if (typeof value.query !== "string" || value.query.length > 2000) {
      throw new Error("Invalid library query");
    }
    criteria.query = value.query.trim();
  }
  if (own(value, "groupId")) {
    criteria.groupId = value.groupId === null ? null : positiveId(value.groupId);
  }
  for (const key of ["markedOnly", "openQuestionsOnly"]) {
    if (!own(value, key)) continue;
    if (typeof value[key] !== "boolean") throw new Error("Invalid library filter");
    criteria[key] = value[key];
  }
  return criteria;
}

export function decodeCriteria(raw) {
  try {
    const stored = JSON.parse(raw);
    assertFields(stored, ["version", "criteria"]);
    if (stored.version !== 1 || !own(stored, "criteria")) return null;
    return validateCriteria(stored.criteria);
  } catch {
    return null;
  }
}

function parseJson(raw) {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Keep the reading view's positional ids, even when malformed entries occur. */
export function librarySegments(raw) {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((segment, index) =>
    segment && typeof segment === "object" && typeof segment.text === "string"
      ? [{ ...segment, id: String(segment.id ?? `legacy-${index}`) }]
      : []
  );
}

function topicNodes(raw) {
  const parsed = parseJson(raw);
  return Array.isArray(parsed?.nodes)
    ? parsed.nodes.filter((node) => node && typeof node.label === "string")
    : [];
}

function phrase(value) {
  return foldText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Exact normalized phrase, bounded by words, not substring or model recall. */
export function matchesSubject(raw, subject) {
  const needle = phrase(subject);
  if (!needle) return false;
  return topicNodes(raw).some((node) => {
    const words = Array.isArray(node.words) ? node.words.filter((w) => typeof w === "string") : [];
    return [node.label, ...words, words.join(" ")].some((value) =>
      ` ${phrase(value)} `.includes(` ${needle} `)
    );
  });
}

export function libraryConversation(row, query = "", subject = "") {
  const segments = librarySegments(row.transcript);
  const excerptQuery = subject || query;
  const found = excerptQuery ? findExcerpt(row, excerptQuery) : null;
  // Subject membership is not proof that the first turn mentions the subject.
  // Descriptions, personal notes and graph links are not transcript quotes.
  const excerpt =
    found?.source === "transcript"
      ? { text: found.before + found.match + found.after, segmentId: found.segmentId ?? null }
      : subject
        ? null
        : segments.length
          ? { text: segments[0].text.slice(0, 240), segmentId: segments[0].id }
          : typeof row.transcript === "string" &&
              row.transcript.trim() &&
              !/^[\s]*[[{]/u.test(row.transcript) &&
              !parseJson(row.transcript)
            ? { text: row.transcript.slice(0, 240), segmentId: null }
            : null;
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    group_id: row.group_id ?? null,
    topics: topicNodes(row.conversation_topics).map((node) => ({
      label: node.label,
      ...(typeof node.description === "string" ? { description: node.description } : {}),
    })),
    excerpt,
    openQuestionCount:
      Number.isSafeInteger(row.open_questions) && row.open_questions >= 0
        ? row.open_questions
        : null,
    markedCount: parseMoments(row.conversation_marks).length,
  };
}

const hashQuote = (text) => createHash("sha256").update(text).digest("hex");

export function passageSource(row, source) {
  assertFields(source, ["noteId", "segmentId", "start", "end"]);
  positiveId(source.noteId);
  if (typeof source.segmentId !== "string" || !source.segmentId || source.segmentId.length > 500) {
    throw new Error("Invalid passage segment");
  }
  if (!row || row.deleted_at != null || row.note_type !== "meeting") {
    throw new Error("Passage source is unavailable");
  }
  const segment = librarySegments(row.transcript).find((item) => item.id === source.segmentId);
  if (!segment) throw new Error("Passage segment is unavailable");
  const start = source.start === undefined ? 0 : source.start;
  const end = source.end === undefined ? segment.text.length : source.end;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > segment.text.length ||
    !segment.text.slice(start, end).trim()
  ) {
    throw new Error("Invalid passage range");
  }
  return { start, end, hash: hashQuote(segment.text.slice(start, end)) };
}

/** No stored title or quote is used when a reference becomes unavailable. */
export function resolvePassage(link, row) {
  const active = row && row.deleted_at == null && row.note_type === "meeting";
  const segment = active
    ? librarySegments(row.transcript).find((item) => item.id === link.segment_id)
    : null;
  const current = segment ? segment.text.slice(link.start_offset, link.end_offset) : null;
  const status =
    current === null
      ? "missing"
      : hashQuote(current) === link.source_hash
        ? "available"
        : "changed";
  return {
    id: link.id,
    noteId: link.note_id,
    segmentId: link.segment_id,
    start: link.start_offset,
    end: link.end_offset,
    quote: status === "available" ? current : "",
    currentQuote: current,
    sourceStatus: status,
    title: active ? row.title : "",
    createdAt: link.created_at,
    note: link.note,
  };
}

export class ConversationLibrary {
  constructor(db) {
    this.db = db;
  }

  async listLibraryConversations(options = {}) {
    assertFields(options, [...CRITERIA_KEYS, "subject", "conversationIds", "cursor", "limit"]);
    const criteria = validateCriteria(
      Object.fromEntries(
        CRITERIA_KEYS.filter((key) => own(options, key)).map((key) => [key, options[key]])
      )
    );
    const limit = options.limit === undefined ? 50 : options.limit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new Error("Invalid page size");
    let cursor = null;
    if (options.cursor != null) {
      // Keep deleted cursor rows: deleting the last item of a page must not
      // prevent seeking from its immutable creation time on the next page.
      cursor = this.db
        .prepare("SELECT id, created_at FROM notes WHERE id = ?")
        .get(positiveId(options.cursor));
      if (!cursor) throw new Error("Library cursor no longer exists. Restart from the first page.");
    }
    if (
      own(options, "subject") &&
      (typeof options.subject !== "string" || options.subject.length > 500)
    ) {
      throw new Error("Invalid library subject");
    }
    let ids = null;
    if (own(options, "conversationIds")) {
      if (!Array.isArray(options.conversationIds)) throw new Error("Invalid conversation ids");
      ids = new Set(options.conversationIds.map(positiveId));
    }
    const subject = options.subject?.replace(/\s+/gu, " ").trim() ?? "";
    const needle = foldText(criteria.query ?? "");
    const conditions = ["note_type = 'meeting'", "deleted_at IS NULL"];
    const params = [];
    if (own(criteria, "groupId")) {
      conditions.push(criteria.groupId === null ? "group_id IS NULL" : "group_id = ?");
      if (criteria.groupId !== null) params.push(criteria.groupId);
    }
    if (criteria.openQuestionsOnly) conditions.push("open_questions > 0");
    const columns = `SELECT id, title, created_at, group_id, conversation_topics, transcript,
        enhanced_content, conversation_marks, open_questions
       FROM notes WHERE ${conditions.join(" AND ")}`;
    const order = " ORDER BY created_at DESC, id DESC LIMIT 16";
    const firstScan = this.db.prepare(columns + order);
    const scan = this.db.prepare(columns + " AND (created_at, id) < (?, ?)" + order);
    // Old notes schemas permit null timestamps. They sort last in SQLite and
    // need their own seek, since a row-value comparison with null is unknown.
    const nullScan = this.db.prepare(columns + " AND created_at IS NULL AND id < ?" + order);
    const items = [];
    // Source-date keyset pages, with ID as the deterministic equal-date tie.
    // A lookahead match establishes whether another page actually exists.
    let sliceStart = Date.now();
    while (true) {
      let batch = !cursor
        ? firstScan.all(...params)
        : cursor.created_at === null
          ? nullScan.all(...params, cursor.id)
          : scan.all(...params, cursor.created_at, cursor.id);
      if (!batch.length && cursor?.created_at != null) {
        batch = nullScan.all(...params, Number.MAX_SAFE_INTEGER);
      }
      if (!batch.length) return { items, cursor: null };
      for (const row of batch) {
        cursor = row;
        if (needle && !foldText(recallText(row)).includes(needle)) continue;
        if (
          (subject || ids) &&
          !ids?.has(row.id) &&
          !(subject && matchesSubject(row.conversation_topics, subject))
        )
          continue;
        if (criteria.markedOnly && !parseMoments(row.conversation_marks).length) continue;
        if (
          criteria.openQuestionsOnly &&
          !(Number.isSafeInteger(row.open_questions) && row.open_questions > 0)
        )
          continue;
        if (items.length === limit) return { items, cursor: items[items.length - 1].id };
        items.push(libraryConversation(row, criteria.query, subject));
      }
      if (Date.now() - sliceStart >= 12) {
        await new Promise((resolve) => setImmediate(resolve));
        sliceStart = Date.now();
      }
    }
  }

  getWorkingSets() {
    return this.db
      .prepare(
        `SELECT s.id, s.name, count(p.id) AS count FROM working_sets s
      LEFT JOIN working_set_passages p ON p.set_id = s.id
      GROUP BY s.id ORDER BY s.id`
      )
      .all();
  }

  createWorkingSet(value) {
    const name = libraryName(value);
    const result = this.db
      .prepare("INSERT INTO working_sets(name, name_key) VALUES (?, ?)")
      .run(name, name.toLowerCase());
    return { id: Number(result.lastInsertRowid), name, count: 0 };
  }

  requireSet(id) {
    positiveId(id);
    if (!this.db.prepare("SELECT id FROM working_sets WHERE id = ?").get(id)) {
      throw new Error("Working set not found");
    }
  }

  renameWorkingSet(id, value) {
    this.requireSet(id);
    const name = libraryName(value);
    this.db
      .prepare("UPDATE working_sets SET name = ?, name_key = ? WHERE id = ?")
      .run(name, name.toLowerCase(), id);
  }

  deleteWorkingSet(id) {
    positiveId(id);
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM working_set_passages WHERE set_id = ?").run(id);
      this.db.prepare("DELETE FROM working_sets WHERE id = ?").run(id);
    })();
  }

  getWorkingSet(id) {
    positiveId(id);
    const set = this.db.prepare("SELECT id, name FROM working_sets WHERE id = ?").get(id);
    if (!set) return null;
    const links = this.db
      .prepare("SELECT * FROM working_set_passages WHERE set_id = ? ORDER BY position, id")
      .all(id);
    const source = this.db.prepare(
      "SELECT title, transcript, note_type, deleted_at FROM notes WHERE id = ? AND deleted_at IS NULL AND note_type = 'meeting'"
    );
    return {
      ...set,
      count: links.length,
      passages: links.map((link) => resolvePassage(link, source.get(link.note_id))),
    };
  }

  addWorkingSetPassage(setId, source) {
    assertFields(source, ["noteId", "segmentId", "start", "end"]);
    positiveId(source.noteId);
    this.db.transaction(() => {
      this.requireSet(setId);
      const row = this.db
        .prepare(
          "SELECT transcript, note_type, deleted_at FROM notes WHERE id = ? AND deleted_at IS NULL"
        )
        .get(source.noteId);
      const range = passageSource(row, source);
      // Only this uniqueness conflict is ignored. Other failed writes roll back.
      this.db
        .prepare(
          `INSERT INTO working_set_passages
        (set_id, note_id, segment_id, start_offset, end_offset, source_hash, position)
        SELECT ?, ?, ?, ?, ?, ?, count(*) FROM working_set_passages WHERE set_id = ?
        ON CONFLICT(set_id, note_id, segment_id, start_offset, end_offset) DO NOTHING`
        )
        .run(setId, source.noteId, source.segmentId, range.start, range.end, range.hash, setId);
    })();
  }

  updateWorkingSetPassage(setId, passageId, update) {
    positiveId(setId);
    positiveId(passageId);
    assertFields(update, ["note", "position"]);
    if (own(update, "note") && (typeof update.note !== "string" || update.note.length > 500)) {
      throw new Error("Passage notes must contain at most 500 characters");
    }
    if (
      own(update, "position") &&
      (!Number.isSafeInteger(update.position) || update.position < 0)
    ) {
      throw new Error("Invalid passage position");
    }
    this.db.transaction(() => {
      this.requireSet(setId);
      const links = this.db
        .prepare("SELECT id FROM working_set_passages WHERE set_id = ? ORDER BY position, id")
        .all(setId)
        .map((row) => row.id);
      const from = links.indexOf(passageId);
      if (from < 0) throw new Error("Working set passage not found");
      if (own(update, "position")) {
        if (update.position >= links.length) throw new Error("Invalid passage position");
        links.splice(from, 1);
        links.splice(update.position, 0, passageId);
        this.writeOrder(setId, links);
      }
      if (own(update, "note"))
        this.db
          .prepare("UPDATE working_set_passages SET note = ? WHERE set_id = ? AND id = ?")
          .run(update.note, setId, passageId);
    })();
  }

  writeOrder(setId, ids) {
    const write = this.db.prepare(
      "UPDATE working_set_passages SET position = ? WHERE set_id = ? AND id = ?"
    );
    ids.forEach((id, position) => write.run(position, setId, id));
  }

  removeWorkingSetPassage(setId, passageId) {
    positiveId(setId);
    positiveId(passageId);
    this.db.transaction(() => {
      this.requireSet(setId);
      this.db
        .prepare("DELETE FROM working_set_passages WHERE set_id = ? AND id = ?")
        .run(setId, passageId);
      this.writeOrder(
        setId,
        this.db
          .prepare("SELECT id FROM working_set_passages WHERE set_id = ? ORDER BY position, id")
          .all(setId)
          .map((row) => row.id)
      );
    })();
  }

  listSavedViews() {
    // Corrupt or newer versions never silently turn into an unfiltered view.
    return this.db
      .prepare("SELECT id, name, criteria_json FROM saved_library_views ORDER BY id")
      .all()
      .flatMap((row) => {
        const criteria = decodeCriteria(row.criteria_json);
        return criteria === null ? [] : [{ id: row.id, name: row.name, criteria }];
      });
  }

  saveLibraryView(view) {
    assertFields(view, ["id", "name", "criteria"]);
    const name = libraryName(view.name);
    const criteria = JSON.stringify({ version: 1, criteria: validateCriteria(view.criteria) });
    if (own(view, "id")) {
      positiveId(view.id);
      const result = this.db
        .prepare(
          "UPDATE saved_library_views SET name = ?, name_key = ?, criteria_json = ? WHERE id = ?"
        )
        .run(name, name.toLowerCase(), criteria, view.id);
      if (!result.changes) throw new Error("Saved library view not found");
    } else {
      this.db
        .prepare("INSERT INTO saved_library_views(name, name_key, criteria_json) VALUES (?, ?, ?)")
        .run(name, name.toLowerCase(), criteria);
    }
  }

  deleteLibraryView(id) {
    positiveId(id);
    this.db.prepare("DELETE FROM saved_library_views WHERE id = ?").run(id);
  }
}
