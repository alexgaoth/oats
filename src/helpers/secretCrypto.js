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

function _loadMasterKeyBackup() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  try {
    const buf = fs.readFileSync(_backupPath());
    const b64 = safeStorage.decryptString(buf);
    const key = Buffer.from(b64, "base64");
    if (key.length !== KEY_LEN) return false;
    masterKey = key;
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      debugLogger.warn(
        "could not read the master key backup",
        { error: error?.message, code: error?.code },
        "secretCrypto"
      );
    }
    return false;
  }
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
    if (stored === null || stored === undefined) {
      // No entry (first launch, or the entry was deleted). This is the only
      // case that makes a new key.
      const key = crypto.randomBytes(KEY_LEN);
      entry.setPassword(key.toString("base64"));
      masterKey = key;
      // Write the safeStorage backup only when the key is first generated.
      // Re-writing on every launch invokes a second Keychain backend on macOS.
      _saveMasterKeyBackup({ keyCreatedNow: true });
    } else {
      const key = Buffer.from(stored, "base64");
      if (key.length !== KEY_LEN) throw new Error("stored key length invalid");
      masterKey = key;
    }
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
