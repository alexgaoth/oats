// Writes conversations into an Obsidian vault folder.
//
// The markdown itself is built by the pure `obsidianNote.mjs`; this module owns
// only the parts that touch the world: where the folder is, when to write,
// which file belongs to which conversation, and refusing to write anywhere the
// user did not point at.
//
// Writes are debounced per note because a conversation's note is updated many
// times — every checkpoint during recording, then again when the title and the
// summary generate. Mirroring each of those would rewrite the file a hundred
// times for one conversation and leave a half-finished note on screen in the
// vault while the reader is looking at it.

const fs = require("fs");
const path = require("path");
const debugLogger = require("./debugLogger");

/** Long enough that a burst of checkpoint writes collapses into one. */
const DEBOUNCE_MS = 4000;

/** Frontmatter is at the top of the file; there is no reason to read the transcript. */
const HEAD_BYTES = 512;
const OATS_ID = /^oats_id:\s*(\d+)\s*$/m;

/** A title and a date can collide; twenty near-misses is already absurd. */
const MAX_SUFFIX = 20;

/** The conversation id an existing note claims, or null if it claims none. */
function claimedId(target) {
  let handle;
  try {
    handle = fs.openSync(target, "r");
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = fs.readSync(handle, buffer, 0, HEAD_BYTES, 0);
    const match = OATS_ID.exec(buffer.subarray(0, read).toString("utf8"));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  } finally {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        // Already closed.
      }
    }
  }
}

class ObsidianVault {
  constructor() {
    this._vaultPath = null;
    this._enabled = false;
    this._timers = new Map();
    // The file each conversation was last written to, so a conversation that is
    // renamed moves its note instead of leaving the old name behind.
    this._paths = new Map();
  }

  configure({ vaultPath, enabled }) {
    const next = typeof vaultPath === "string" && vaultPath.trim() ? vaultPath : null;
    // A pending write belongs to the folder it was scheduled against. Turning
    // the export off, or pointing it somewhere else, must not drop the last
    // conversation into the new folder four seconds later.
    if (next !== this._vaultPath || !enabled) this.stop();
    if (next !== this._vaultPath) this._paths.clear();
    this._vaultPath = next;
    this._enabled = Boolean(enabled) && Boolean(this._vaultPath);
  }

  isEnabled() {
    return this._enabled;
  }

  getVaultPath() {
    return this._vaultPath;
  }

  /**
   * Resolve the target inside the vault, or null if it would escape it.
   *
   * `safeFilename` already strips separators, so this is defence in depth
   * rather than the only guard — but a note title is user data that reaches a
   * filesystem path, and that combination deserves two checks rather than one.
   */
  _resolveInsideVault(filename) {
    if (!this._vaultPath) return null;
    const base = path.resolve(this._vaultPath);
    const target = path.resolve(base, filename);
    const withSep = base.endsWith(path.sep) ? base : base + path.sep;
    return target.startsWith(withSep) ? target : null;
  }

  /** Free, or already this conversation's own note. */
  _available(target, noteId) {
    if (!fs.existsSync(target)) return true;
    return claimedId(target) === noteId;
  }

  /**
   * Where this conversation's note goes.
   *
   * Two conversations on one day can be given the same title, and the reader
   * may have a note of their own under that name. Neither may be silently
   * overwritten, so a taken name gets a number.
   */
  _targetFor(noteId, filename) {
    const base = this._resolveInsideVault(filename);
    if (!base) return null;
    if (this._available(base, noteId)) return base;
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    for (let n = 2; n <= MAX_SUFFIX; n++) {
      const candidate = `${stem} ${n}${ext}`;
      if (this._available(candidate, noteId)) return candidate;
    }
    return null;
  }

  /** Write now. Returns {success, filePath} or {success:false, error}. */
  write(noteId, filename, markdown) {
    if (!this._vaultPath) return { success: false, error: "No vault folder configured" };
    const target = this._targetFor(noteId, filename);
    if (!target) return { success: false, error: "Refusing to write outside the vault folder" };
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // A conversation is titled after it is recorded, and resuming one titles
      // it again — so the mirror moves its note rather than accumulating one
      // file per name the conversation has ever had. Only within this run: a
      // rename after a restart leaves the older file, which is a stale note
      // rather than a lost one.
      const previous = this._paths.get(noteId);
      if (previous && previous !== target) {
        try {
          fs.rmSync(previous, { force: true });
        } catch (error) {
          debugLogger.warn("Vault rename left the old note", { error: error?.message }, "obsidian");
        }
      }
      fs.writeFileSync(target, markdown, "utf8");
      this._paths.set(noteId, target);
      return { success: true, filePath: target };
    } catch (error) {
      debugLogger.warn("Vault write failed", { error: error?.message }, "obsidian");
      return { success: false, error: error?.message || "Write failed" };
    }
  }

  /** Coalesce the writes for one note; the last state wins. */
  schedule(noteId, build) {
    if (!this._enabled) return;
    const existing = this._timers.get(noteId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._timers.delete(noteId);
      // `build` is async because the markdown helper is a native ES module and
      // this file is CommonJS, so it arrives through a dynamic import. It
      // returns null when the conversation is not ready to be mirrored yet.
      Promise.resolve()
        .then(build)
        .then((payload) => {
          if (payload) this.write(noteId, payload.filename, payload.markdown);
        })
        .catch((error) => {
          debugLogger.warn("Vault build failed", { noteId, error: error?.message }, "obsidian");
        });
    }, DEBOUNCE_MS);
    // A pending mirror write must never hold the app open at quit.
    if (typeof timer.unref === "function") timer.unref();
    this._timers.set(noteId, timer);
  }

  /** Drop pending writes — called when the vault folder changes or is turned off. */
  stop() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
  }
}

module.exports = new ObsidianVault();
