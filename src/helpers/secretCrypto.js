const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");
const debugLogger = require("./debugLogger");

const SERVICE = "Oats";
const ACCOUNT = "secrets-master-key";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const BACKUP_FILE = "master-key-backup.enc";

let mode = null;
let masterKey = null;

function _backupPath() {
  return path.join(app.getPath("userData"), "secure-keys", BACKUP_FILE);
}

// An existing backup can be the last copy of the key that decrypts the saved
// secrets. Only a key that the caller created in the same call may replace it.
function _saveMasterKeyBackup({ keyCreatedNow = false } = {}) {
  if (!masterKey || !safeStorage.isEncryptionAvailable()) return;
  const target = _backupPath();
  if (!keyCreatedNow && fs.existsSync(target)) {
    debugLogger.warn("master key backup exists; not writing over it", {}, "secretCrypto");
    return;
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const encrypted = safeStorage.encryptString(masterKey.toString("base64"));
    const tmp = target + ".tmp";
    fs.writeFileSync(tmp, encrypted, { mode: 0o600 });
    fs.renameSync(tmp, target);
  } catch (error) {
    debugLogger.warn("failed to save master key backup", { error: error?.message }, "secretCrypto");
  }
}

// What the backup gives: "key" (a 32-byte key), "missing" (no file),
// "unreadable" (the bytes give no key), or "unknown" (the bytes were not
// checked, because safeStorage is off or the file could not be read).
function _readMasterKeyBackup() {
  const target = _backupPath();
  if (!safeStorage.isEncryptionAvailable()) {
    return fs.existsSync(target)
      ? { state: "unknown", error: new Error("safeStorage is not available") }
      : { state: "missing" };
  }
  let buf;
  try {
    buf = fs.readFileSync(target);
  } catch (error) {
    return error?.code === "ENOENT" ? { state: "missing" } : { state: "unknown", error };
  }
  try {
    const key = Buffer.from(safeStorage.decryptString(buf), "base64");
    if (key.length !== KEY_LEN) throw new Error("backup key length invalid");
    return { state: "key", key };
  } catch (error) {
    return { state: "unreadable", error };
  }
}

function _loadMasterKeyBackup() {
  const backup = _readMasterKeyBackup();
  if (backup.state === "key") {
    masterKey = backup.key;
    return true;
  }
  if (backup.state !== "missing") {
    debugLogger.warn(
      "could not read the master key backup",
      { state: backup.state, error: backup.error?.message, code: backup.error?.code },
      "secretCrypto"
    );
  }
  return false;
}

// The backup's bytes give no key. Keep them under a new name,
// master-key-backup.enc.unreadable-<UTC time>, so that the backup of a new
// key does not write over them.
function _moveBackupAside(reason) {
  const target = _backupPath();
  const aside = `${target}.unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    if (fs.existsSync(aside)) throw new Error("a file with that name already exists");
    fs.renameSync(target, aside);
  } catch (error) {
    debugLogger.warn(
      "could not move the unreadable master key backup aside; not creating a new key",
      { error: error?.message, code: error?.code },
      "secretCrypto"
    );
    return false;
  }
  debugLogger.warn(
    "the master key backup gives no key; moved it aside",
    { file: path.basename(aside), error: reason?.message },
    "secretCrypto"
  );
  return true;
}

// There is no keychain entry: the first launch, or the entry was deleted. The
// backup can still hold the key that decrypts the saved secrets, so that key
// goes back into the keychain. A new key is made only when there is no
// backup, or when the backup's bytes give no key. Because of this, deleting
// the keychain entry alone does not reset the saved secrets.
function _restoreOrCreateKey(entry) {
  const backup = _readMasterKeyBackup();
  if (backup.state === "key") {
    masterKey = backup.key;
    try {
      entry.setPassword(backup.key.toString("base64"));
      debugLogger.info(
        "restored the master key to the OS keychain from the backup",
        {},
        "secretCrypto"
      );
    } catch (error) {
      // The backup key is still the right key. Use it, write nothing, and try
      // the keychain again on the next launch.
      debugLogger.warn(
        "could not write the master key back to the OS keychain; using the backup key",
        { error: error?.message, code: error?.code, platform: process.platform },
        "secretCrypto"
      );
    }
    return true;
  }
  if (backup.state === "unknown") {
    // The bytes were not checked, so they can still hold the key. Write
    // nothing, as for a keychain read error.
    debugLogger.warn(
      "no keychain entry, and the master key backup could not be checked; not creating a new key",
      { error: backup.error?.message, code: backup.error?.code },
      "secretCrypto"
    );
    return false;
  }
  if (backup.state === "unreadable" && !_moveBackupAside(backup.error)) return false;

  const key = crypto.randomBytes(KEY_LEN);
  entry.setPassword(key.toString("base64"));
  masterKey = key;
  // Write the safeStorage backup only when the key is first generated.
  // Re-writing on every launch invokes a second Keychain backend on macOS.
  _saveMasterKeyBackup({ keyCreatedNow: true });
  return true;
}

function _initKeychain() {
  let Entry;
  try {
    ({ Entry } = require("@napi-rs/keyring"));
  } catch (error) {
    debugLogger.warn("@napi-rs/keyring failed to load", { error: error?.message }, "secretCrypto");
    return false;
  }

  let entry;
  let stored;
  try {
    entry = new Entry(SERVICE, ACCOUNT);
    stored = entry.getPassword();
  } catch (error) {
    // getPassword returns null when there is no entry, so an error means the
    // entry could not be read: the user clicked Deny on the macOS prompt (it
    // comes back after every change of the app's signature), the keychain is
    // locked, or the Security framework failed. The entry can still hold the
    // key that decrypts the saved secrets, so write nothing here: no new key,
    // no setPassword, no backup. _ensureInit tries the backup next.
    debugLogger.warn(
      "could not read the master key from the OS keychain; not creating a new key",
      { error: error?.message, code: error?.code, platform: process.platform },
      "secretCrypto"
    );
    return false;
  }

  try {
    // No entry is the only case that can make a new key.
    if (stored === null || stored === undefined) return _restoreOrCreateKey(entry);
    const key = Buffer.from(stored, "base64");
    if (key.length !== KEY_LEN) throw new Error("stored key length invalid");
    masterKey = key;
    return true;
  } catch (error) {
    debugLogger.warn(
      "OS keychain unavailable — falling back to safeStorage",
      { error: error?.message, platform: process.platform },
      "secretCrypto"
    );
    return false;
  }
}

function _ensureInit() {
  if (mode) return;
  if (_initKeychain()) {
    mode = "keychain";
    return;
  }
  if (_loadMasterKeyBackup()) {
    mode = "keychain";
    debugLogger.info("recovered master key from safeStorage backup", {}, "secretCrypto");
    return;
  }
  // Nothing above wrote over the keychain entry or the backup, so a later
  // launch that can read the keychain still decrypts the saved secrets.
  mode = safeStorage.isEncryptionAvailable() ? "safeStorage" : "unavailable";
  debugLogger.warn("no master key; using fallback encryption", { mode }, "secretCrypto");
}

function isAvailable() {
  _ensureInit();
  return mode !== "unavailable";
}

function encrypt(plaintext) {
  _ensureInit();
  if (mode === "keychain") {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, masterKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]);
  }
  if (mode === "safeStorage") return safeStorage.encryptString(plaintext);
  throw new Error("no encryption backend available");
}

function decrypt(blob) {
  _ensureInit();
  if (mode === "keychain" && blob.length > IV_LEN + TAG_LEN) {
    try {
      const iv = blob.subarray(0, IV_LEN);
      const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
      const ct = blob.subarray(IV_LEN + TAG_LEN);
      const decipher = crypto.createDecipheriv(ALGO, masterKey, iv);
      decipher.setAuthTag(tag);
      const value = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
      return { value, needsReencrypt: false };
    } catch {
      // Legacy safeStorage blob — handled by the fallback below.
    }
  }
  if (safeStorage.isEncryptionAvailable()) {
    return {
      value: safeStorage.decryptString(blob),
      needsReencrypt: mode === "keychain",
    };
  }
  throw new Error("decryption failed: no backend available");
}

module.exports = { encrypt, decrypt, isAvailable };
