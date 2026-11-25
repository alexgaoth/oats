const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

// secretCrypto keeps the AES master key in the OS keychain (@napi-rs/keyring)
// and a safeStorage copy in userData/secure-keys/master-key-backup.enc. A read
// error must not write over the keychain entry or the backup, because the
// entry can still hold the key that decrypts the saved secrets. When there is
// no entry (getPassword returns null), the backup's key goes back into the
// keychain. A new key is made only when there is no backup, or when the
// backup's bytes give no key. Those bytes move aside first.
//
// Electron and the keyring are fakes, so these tests never touch the real
// keychain or the real userData folder.

let userData;
let keychain;
let encryptionAvailable;

const realRename = fs.renameSync;

const fakeSafeStorage = {
  isEncryptionAvailable: () => encryptionAvailable,
  encryptString: (text) => Buffer.from(`fake-safe:${text}`, "utf8"),
  decryptString: (blob) => {
    const text = blob.toString("utf8");
    if (!text.startsWith("fake-safe:")) throw new Error("not a fake safeStorage blob");
    return text.slice("fake-safe:".length);
  },
};

class FakeEntry {
  constructor(service, account) {
    keychain.opened.push(`${service}/${account}`);
  }
  getPassword() {
    keychain.reads += 1;
    return keychain.read();
  }
  setPassword(value) {
    keychain.attempted.push(value);
    if (keychain.setError) throw keychain.setError;
    keychain.writes.push(value);
  }
}

const fakeElectron = {
  app: { getPath: () => userData, isReady: () => false },
  safeStorage: fakeSafeStorage,
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return fakeElectron;
  if (request === "@napi-rs/keyring") return { Entry: FakeEntry };
  return originalLoad.call(this, request, ...rest);
};

const debugLogger = require("../../src/helpers/debugLogger");

const MODULE_PATH = require.resolve("../../src/helpers/secretCrypto");
const STORED_KEY = Buffer.alloc(32, 7);
const STORED_KEY_B64 = STORED_KEY.toString("base64");
const DENIED = "User canceled the operation.";
const NOT_A_BLOB = Buffer.from("not a safeStorage blob");

const backupPath = () => path.join(userData, "secure-keys", "master-key-backup.enc");
const secureKeys = () => fs.readdirSync(path.dirname(backupPath())).sort();
const readDenied = () => {
  throw Object.assign(new Error(DENIED), { code: "GenericFailure" });
};

// Same blob layout as secretCrypto: iv (12) | tag (16) | ciphertext.
function encryptWith(key, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

// Fresh module state (mode, masterKey), userData folder and keychain fake. The
// spies record each file write that secretCrypto makes under userData. A
// string backup is a key, stored as safeStorage stores it. A Buffer backup is
// written as it is. With failMoveAside, the rename that moves a backup aside
// fails, and the other renames still run.
function setup(t, { read, setError, backup, safeStorageAvailable = true, failMoveAside } = {}) {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), "oats-secret-crypto-"));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  keychain = { read, setError, reads: 0, attempted: [], writes: [], opened: [] };
  encryptionAvailable = safeStorageAvailable;
  if (backup !== undefined) {
    fs.mkdirSync(path.dirname(backupPath()), { recursive: true });
    const bytes = Buffer.isBuffer(backup) ? backup : fakeSafeStorage.encryptString(backup);
    fs.writeFileSync(backupPath(), bytes);
  }

  const writeFile = t.mock.method(fs, "writeFileSync");
  const rename = t.mock.method(fs, "renameSync", function (from, to) {
    if (failMoveAside && String(to).includes(".unreadable-")) {
      throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
    }
    return realRename.call(this, from, to);
  });
  const warn = t.mock.method(debugLogger, "warn", () => {});
  const info = t.mock.method(debugLogger, "info", () => {});
  const underUserData = (spy) =>
    spy.mock.calls.filter((call) => String(call.arguments[0]).startsWith(userData));

  delete require.cache[MODULE_PATH];
  return {
    secretCrypto: require(MODULE_PATH),
    fileWrites: () => underUserData(writeFile),
    renames: () => underUserData(rename),
    logged: () => [...warn.mock.calls, ...info.mock.calls].map((call) => call.arguments),
  };
}

for (const missing of [null, undefined]) {
  test(`getPassword returns ${missing} and there is no backup: makes a new key, stores it once, backs it up once`, (t) => {
    const { secretCrypto, fileWrites, renames } = setup(t, { read: () => missing });

    assert.equal(secretCrypto.isAvailable(), true);
    assert.equal(secretCrypto.isAvailable(), true, "a second call does not init again");

    assert.equal(keychain.writes.length, 1, "setPassword ran once");
    const newKey = Buffer.from(keychain.writes[0], "base64");
    assert.equal(newKey.length, 32);

    assert.equal(fileWrites().length, 1, "backup written once");
    assert.equal(renames().length, 1);
    assert.equal(renames()[0].arguments[1], backupPath());
    const backup = fakeSafeStorage.decryptString(fs.readFileSync(backupPath()));
    assert.equal(backup, keychain.writes[0], "backup holds the stored key");

    assert.equal(secretCrypto.decrypt(encryptWith(newKey, "placeholder")).value, "placeholder");
  });
}

// setPassword runs before the backup write. When it fails, the new key is
// saved nowhere, so it must not reach the backup or encrypt anything.
test("getPassword returns null, there is no backup, and setPassword throws: writes nothing, mode is safeStorage", (t) => {
  const { secretCrypto, fileWrites, renames } = setup(t, {
    read: () => null,
    setError: new Error("write denied"),
  });

  assert.equal(secretCrypto.isAvailable(), true);
  assert.equal(keychain.attempted.length, 1, "setPassword was tried once");
  assert.equal(fileWrites().length + renames().length, 0, "backup not written");
  assert.equal(fs.existsSync(backupPath()), false);
  assert.equal(secretCrypto.encrypt("placeholder").toString("utf8"), "fake-safe:placeholder");
});

// No entry, and the backup holds a key: that key goes back into the keychain,
// and the backup is not written. When setPassword fails, the backup key is
// still used, and the next launch tries the keychain again.
for (const setFails of [false, true]) {
  const outcome = setFails
    ? "setPassword throws, and the backup key is still used"
    : "the backup key goes back into the keychain";
  test(`getPassword returns null and the backup holds a key: ${outcome}`, (t) => {
    const { secretCrypto, fileWrites, renames, logged } = setup(t, {
      read: () => null,
      setError: setFails ? new Error("write denied") : undefined,
      backup: STORED_KEY_B64,
    });
    const before = fs.readFileSync(backupPath());

    assert.equal(secretCrypto.isAvailable(), true);
    assert.deepEqual(keychain.attempted, [STORED_KEY_B64], "setPassword got the backup key once");
    assert.deepEqual(keychain.writes, setFails ? [] : [STORED_KEY_B64]);
    assert.equal(fileWrites().length + renames().length, 0, "backup not written");
    assert.deepEqual(secureKeys(), ["master-key-backup.enc"]);
    assert.deepEqual(fs.readFileSync(backupPath()), before);

    // The backup key is in use: a secret saved under it still decrypts.
    const { value, needsReencrypt } = secretCrypto.decrypt(encryptWith(STORED_KEY, "placeholder"));
    assert.equal(value, "placeholder");
    assert.equal(needsReencrypt, false);
    assert.ok(!JSON.stringify(logged()).includes(STORED_KEY_B64), "no key in the log");
  });
}

// No entry, and the backup's bytes give no key. They move aside under a new
// name. Then a new key is made, as when there is no backup.
for (const [label, bytes] of [
  ["does not decrypt", NOT_A_BLOB],
  ["holds a 16-byte key", fakeSafeStorage.encryptString(Buffer.alloc(16, 1).toString("base64"))],
]) {
  test(`getPassword returns null and the backup ${label}: moves it aside, makes a new key`, (t) => {
    const { secretCrypto, fileWrites, renames } = setup(t, { read: () => null, backup: bytes });

    assert.equal(secretCrypto.isAvailable(), true);

    // The old bytes are kept, under a name with the UTC time.
    const [backupName, asideName, ...others] = secureKeys();
    assert.equal(backupName, "master-key-backup.enc");
    assert.match(
      asideName,
      /^master-key-backup\.enc\.unreadable-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/
    );
    assert.deepEqual(others, []);
    assert.deepEqual(fs.readFileSync(path.join(path.dirname(backupPath()), asideName)), bytes);

    // A new key, stored once and backed up once.
    assert.equal(keychain.writes.length, 1, "setPassword ran once");
    const newKey = Buffer.from(keychain.writes[0], "base64");
    assert.equal(newKey.length, 32);
    assert.equal(fakeSafeStorage.decryptString(fs.readFileSync(backupPath())), keychain.writes[0]);
    assert.equal(fileWrites().length, 1, "backup written once");
    assert.equal(renames().length, 2, "one move aside, one backup write");
    assert.equal(secretCrypto.decrypt(encryptWith(newKey, "placeholder")).value, "placeholder");
  });
}

test("getPassword returns null, the backup gives no key, and the move fails: writes nothing", (t) => {
  const { secretCrypto, fileWrites, renames } = setup(t, {
    read: () => null,
    backup: NOT_A_BLOB,
    failMoveAside: true,
  });

  assert.equal(secretCrypto.isAvailable(), true);
  assert.equal(keychain.attempted.length, 0, "setPassword did not run");
  assert.equal(fileWrites().length, 0, "backup not written");
  assert.equal(renames().length, 1, "only the failed move was tried");
  assert.deepEqual(secureKeys(), ["master-key-backup.enc"]);
  assert.deepEqual(fs.readFileSync(backupPath()), NOT_A_BLOB, "backup kept in place");
  // As for a read error: there is no master key, so new secrets go to safeStorage.
  assert.equal(secretCrypto.encrypt("placeholder").toString("utf8"), "fake-safe:placeholder");
});

// No entry, and the backup could not be checked. Its bytes can still hold the
// key, so nothing is written, as for a read error.
test("getPassword returns null and safeStorage is off: writes nothing and keeps the backup", (t) => {
  const { secretCrypto, fileWrites, renames } = setup(t, {
    read: () => null,
    backup: STORED_KEY_B64,
    safeStorageAvailable: false,
  });
  const before = fs.readFileSync(backupPath());

  assert.equal(secretCrypto.isAvailable(), false, "mode is unavailable");
  assert.equal(keychain.attempted.length, 0, "setPassword did not run");
  assert.equal(fileWrites().length + renames().length, 0, "nothing written");
  assert.deepEqual(secureKeys(), ["master-key-backup.enc"]);
  assert.deepEqual(fs.readFileSync(backupPath()), before);
});

test("getPassword returns null and the backup cannot be read: writes nothing", (t) => {
  const { secretCrypto, fileWrites, renames } = setup(t, { read: () => null });
  // Reading a folder fails with EISDIR, as a file without read access fails
  // with EACCES.
  fs.mkdirSync(backupPath(), { recursive: true });

  assert.equal(secretCrypto.isAvailable(), true);
  assert.equal(keychain.attempted.length, 0, "setPassword did not run");
  assert.equal(fileWrites().length + renames().length, 0, "nothing written");
  assert.ok(fs.statSync(backupPath()).isDirectory(), "backup left in place");
  assert.equal(secretCrypto.encrypt("placeholder").toString("utf8"), "fake-safe:placeholder");
});

test("getPassword throws: writes nothing and loads the existing backup", (t) => {
  const { secretCrypto, fileWrites, renames, logged } = setup(t, {
    read: readDenied,
    backup: STORED_KEY_B64,
  });
  const before = fs.readFileSync(backupPath());

  assert.equal(secretCrypto.isAvailable(), true);
  assert.equal(keychain.reads, 1);
  assert.equal(keychain.attempted.length, 0, "setPassword did not run");
  assert.equal(fileWrites().length + renames().length, 0, "backup not written");
  assert.deepEqual(fs.readFileSync(backupPath()), before);

  // The backup key is in use: a secret saved under it still decrypts.
  const { value, needsReencrypt } = secretCrypto.decrypt(encryptWith(STORED_KEY, "placeholder"));
  assert.equal(value, "placeholder");
  assert.equal(needsReencrypt, false);

  // The cause is in the log, and no key is.
  assert.ok(
    logged().some(([message, meta]) => /keychain/.test(message) && meta?.error === DENIED),
    "read error logged"
  );
  assert.ok(!JSON.stringify(logged()).includes(STORED_KEY_B64), "no key in the log");
});

for (const available of [true, false]) {
  const fallback = available ? "safeStorage" : "unavailable";
  test(`getPassword throws and there is no backup: writes nothing, mode is ${fallback}`, (t) => {
    const { secretCrypto, fileWrites, renames } = setup(t, {
      read: readDenied,
      safeStorageAvailable: available,
    });

    assert.equal(secretCrypto.isAvailable(), available);
    assert.equal(keychain.attempted.length, 0, "setPassword did not run");
    assert.equal(fileWrites().length + renames().length, 0, "backup not written");
    assert.equal(fs.existsSync(backupPath()), false);

    if (available) {
      // New secrets go to safeStorage, not to an AES key that is saved nowhere.
      assert.equal(secretCrypto.encrypt("placeholder").toString("utf8"), "fake-safe:placeholder");
    } else {
      assert.throws(() => secretCrypto.encrypt("placeholder"), /no encryption backend/);
    }
  });
}

test("getPassword returns a stored key: uses that key and writes nothing", (t) => {
  const { secretCrypto, fileWrites, renames } = setup(t, { read: () => STORED_KEY_B64 });

  assert.equal(secretCrypto.isAvailable(), true);
  assert.deepEqual(keychain.opened, ["Oats/secrets-master-key"]);
  assert.equal(keychain.attempted.length, 0, "setPassword did not run");
  assert.equal(fileWrites().length + renames().length, 0, "nothing written");
  assert.equal(fs.existsSync(backupPath()), false, "no backup added for a stored key");

  const { value, needsReencrypt } = secretCrypto.decrypt(encryptWith(STORED_KEY, "placeholder"));
  assert.equal(value, "placeholder");
  assert.equal(needsReencrypt, false);
});

for (const [label, stored] of [
  ["an empty string", ""],
  ["a 16-byte key", Buffer.alloc(16, 1).toString("base64")],
]) {
  test(`getPassword returns ${label}: makes no new key and keeps the backup`, (t) => {
    const { secretCrypto, fileWrites, renames } = setup(t, {
      read: () => stored,
      backup: STORED_KEY_B64,
    });
    const before = fs.readFileSync(backupPath());

    assert.equal(secretCrypto.isAvailable(), true);
    assert.equal(keychain.attempted.length, 0, "setPassword did not run");
    assert.equal(fileWrites().length + renames().length, 0, "backup not written");
    assert.deepEqual(fs.readFileSync(backupPath()), before);
    assert.equal(secretCrypto.decrypt(encryptWith(STORED_KEY, "placeholder")).value, "placeholder");
  });
}

// _saveMasterKeyBackup is private, and the module calls it only for a new key.
// Compile a copy of the module that also exports it, to test its guard.
function loadBackupWriter() {
  const source =
    fs.readFileSync(MODULE_PATH, "utf8") +
    "\nmodule.exports.__test = { saveBackup: _saveMasterKeyBackup," +
    " setKey: (key) => { masterKey = key; } };\n";
  const copy = new Module(MODULE_PATH, module);
  copy.filename = MODULE_PATH;
  copy.paths = Module._nodeModulePaths(path.dirname(MODULE_PATH));
  copy._compile(source, MODULE_PATH);
  return copy.exports.__test;
}

test("the backup writer keeps an existing backup unless the key is new in this call", (t) => {
  const { fileWrites } = setup(t, { backup: STORED_KEY_B64 });
  const { saveBackup, setKey } = loadBackupWriter();
  const before = fs.readFileSync(backupPath());
  const otherKey = Buffer.alloc(32, 9);
  setKey(otherKey);

  saveBackup();
  assert.deepEqual(fs.readFileSync(backupPath()), before, "existing backup kept");
  assert.equal(fileWrites().length, 0);

  saveBackup({ keyCreatedNow: true });
  const backup = fakeSafeStorage.decryptString(fs.readFileSync(backupPath()));
  assert.equal(backup, otherKey.toString("base64"), "a key created now replaces it");
});
