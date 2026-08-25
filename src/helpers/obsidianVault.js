// Writes conversations into an Obsidian vault folder.
//
// The markdown itself is built by the pure `obsidianNote.mjs`; this module owns
// only the parts that touch the world: where the folder is, when to write, and
// refusing to write anywhere the user did not point at.
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

class ObsidianVault {
  constructor() {
    this._vaultPath = null;
    this._enabled = false;
    this._timers = new Map();
  }

  configure({ vaultPath, enabled }) {
    this._vaultPath = typeof vaultPath === "string" && vaultPath.trim() ? vaultPath : null;
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

  /** Write now. Returns {success, filePath} or {success:false, error}. */
  write(filename, markdown) {
    if (!this._vaultPath) return { success: false, error: "No vault folder configured" };
    const target = this._resolveInsideVault(filename);
    if (!target) return { success: false, error: "Refusing to write outside the vault folder" };
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, markdown, "utf8");
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
      // this file is CommonJS, so it arrives through a dynamic import.
      Promise.resolve()
        .then(build)
        .then((payload) => {
          if (payload) this.write(payload.filename, payload.markdown);
        })
        .catch((error) => {
          debugLogger.warn("Vault build failed", { noteId, error: error?.message }, "obsidian");
        });
    }, DEBOUNCE_MS);
    // A pending mirror write must never hold the app open at quit.
    if (typeof timer.unref === "function") timer.unref();
    this._timers.set(noteId, timer);
  }

  /** Drop pending writes — called at shutdown. */
  stop() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
  }
}

module.exports = new ObsidianVault();
