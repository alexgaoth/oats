const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const crypto = require("crypto");
const { app } = require("electron");
const debugLogger = require("./debugLogger");
const { normalizeUiLanguage } = require("./i18nMain");
const secretCrypto = require("./secretCrypto");
const { BYOK_API_KEYS } = require("../config/secretKeys");

// Named keys (helpers/apiKeys.mjs): the providers that keep more than one key,
// each provider's single slot, and the files in secure-keys that hold them.
const NAMED_KEY_SLOTS = Object.fromEntries(
  BYOK_API_KEYS.filter((k) => k.named).map((k) => [k.base, k.env])
);
const KEY_LIST_FILE = "api-keys.json";
const KEY_FILE = /^api-key-(k[0-9a-f]{16})\.(enc|plain)$/;
const KEY_ID = /^k[0-9a-f]{16}$/;
// The longest secret a key may be: far above any provider's, far below abuse.
const KEY_SECRET_MAX = 512;
// Writes of key files and the list, in order, across every instance.
let keyWriteQueue = Promise.resolve();

const SECRET_KEYS = [
  ...BYOK_API_KEYS.map((k) => k.env),
  "ASSEMBLYAI_API_KEY",
  "DEEPGRAM_API_KEY",
  "CUSTOM_TRANSCRIPTION_API_KEY",
  "CUSTOM_CLEANUP_API_KEY",
  "BEDROCK_ACCESS_KEY_ID",
  "BEDROCK_SECRET_ACCESS_KEY",
  "BEDROCK_SESSION_TOKEN",
  "AZURE_OPENAI_API_KEY",
  "VERTEX_API_KEY",
];

const SECRET_KEY_SET = new Set(SECRET_KEYS);

const PERSISTED_KEYS = [
  ...SECRET_KEYS,
  "LOCAL_TRANSCRIPTION_PROVIDER",
  "PARAKEET_MODEL",
  "LOCAL_WHISPER_MODEL",
  "LOCAL_WHISPER_LANGUAGE",
  "CLEANUP_PROVIDER",
  "LOCAL_CLEANUP_MODEL",
  "DICTATION_AGENT_PROVIDER",
  "LOCAL_DICTATION_AGENT_MODEL",
  "LLAMA_GPU_BACKEND",
  "LLAMA_VULKAN_ENABLED",
  "DICTATION_KEY",
  "CHAT_AGENT_KEY",
  "VOICE_AGENT_KEY",
  "CONVERSATION_KEY",
  "SEARCH_KEY",
  "TRANSLATION_KEY",
  "MEETING_KEY",
  "ACTIVATION_MODE",
  "DICTATION_ENABLED",
  "FLOATING_ICON_AUTO_HIDE",
  "PANEL_START_POSITION",
  "START_MINIMIZED",
  "UI_LANGUAGE",
  "WHISPER_CUDA_ENABLED",
  "WHISPER_VULKAN_ENABLED",
  "WHISPER_THREADS",
  "TRANSCRIPTION_GPU_UUID",
  "INTELLIGENCE_GPU_UUID",
  "BEDROCK_REGION",
  "BEDROCK_PROFILE",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
  "VERTEX_PROJECT",
  "VERTEX_LOCATION",
];

// Module-level so writes are serialized across all instances — hotkeyManager
// creates its own EnvironmentManager alongside the main.js singleton.
let envWriteQueue = Promise.resolve();

class EnvironmentManager {
  constructor() {
    this.loadEnvironmentVariables();
  }

  loadEnvironmentVariables() {
    // App config (.env in userData) takes precedence over system env vars,
    // so keys saved by the user in Settings always win.
    const userDataEnv = path.join(app.getPath("userData"), ".env");
    try {
      if (fs.existsSync(userDataEnv)) {
        require("dotenv").config({ path: userDataEnv, override: true });
      }
    } catch {}

    // Development reads the checkout's .env. A packaged build reads only the
    // user's own (above): a .env shipped inside the app was whatever the person
    // who built it had on disk — API keys included — and every key found in it
    // was migrated into each user's Keychain on first launch.
    const fallbackPaths = app.isPackaged ? [] : [path.join(__dirname, "..", "..", ".env")];

    for (const envPath of fallbackPaths) {
      try {
        if (fs.existsSync(envPath)) {
          require("dotenv").config({ path: envPath });
        }
      } catch {}
    }
  }

  // Encryption initializes lazily. Probing it eagerly would touch the macOS
  // Keychain before any window is visible. Migration and _loadAllSecrets are
  // both no-ops on fresh installs, so neither path triggers Keychain until
  // the user actually saves their first secret.
  async init() {
    if (!fs.existsSync(this._getMigrationSentinelPath())) {
      await this._migrateToSecureStorage();
    }
    await this._loadAllSecrets();
    // Named keys never stop a launch: without them, every call uses the slots.
    await this._loadApiKeys().catch((error) => {
      debugLogger.error("Could not load the named keys", { error: error.message }, "environment");
      this._keyRules = null;
      this._keyList = null;
    });
  }

  _getMigrationSentinelPath() {
    return path.join(this._getSecureKeysDir(), ".migrated");
  }

  _encryptionAvailable() {
    try {
      return secretCrypto.isAvailable();
    } catch {
      return false;
    }
  }

  _getSecureKeysDir() {
    return path.join(app.getPath("userData"), "secure-keys");
  }

  _getSecretFilePath(envVarName) {
    return path.join(this._getSecureKeysDir(), `${envVarName}.enc`);
  }

  async _loadAllSecrets() {
    await Promise.all(SECRET_KEYS.map((name) => this._loadSecretKey(name)));
  }

  async _loadSecretKey(envVarName) {
    const filePath = this._getSecretFilePath(envVarName);
    try {
      const buffer = await fsPromises.readFile(filePath);
      const { value, needsReencrypt } = secretCrypto.decrypt(buffer);
      process.env[envVarName] = value;
      if (needsReencrypt) await this._saveSecretKey(envVarName, value);
    } catch (error) {
      if (error.code === "ENOENT") return;
      debugLogger.error(
        "Failed to decrypt secret — user must re-enter",
        { key: envVarName, code: error.code, error: error.message },
        "environment"
      );
    }
  }

  async _saveSecretKey(envVarName, value) {
    if (!value) {
      await this._deleteSecretKey(envVarName);
      return;
    }

    process.env[envVarName] = value;

    const dir = this._getSecureKeysDir();
    await fsPromises.mkdir(dir, { recursive: true });

    const filePath = this._getSecretFilePath(envVarName);
    const tmpPath = `${filePath}.tmp`;
    const encrypted = secretCrypto.encrypt(value);

    await fsPromises.writeFile(tmpPath, encrypted);
    await fsPromises.rename(tmpPath, filePath);
  }

  async _deleteSecretKey(envVarName) {
    delete process.env[envVarName];
    try {
      await fsPromises.unlink(this._getSecretFilePath(envVarName));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async _migrateToSecureStorage() {
    const dir = this._getSecureKeysDir();
    await fsPromises.mkdir(dir, { recursive: true });

    // Adopt renamed key so the value survives migration. Old releases stored
    // it under CUSTOM_REASONING_API_KEY; new code only encrypts CUSTOM_CLEANUP_API_KEY.
    if (process.env.CUSTOM_REASONING_API_KEY && !process.env.CUSTOM_CLEANUP_API_KEY) {
      process.env.CUSTOM_CLEANUP_API_KEY = process.env.CUSTOM_REASONING_API_KEY;
    }
    delete process.env.CUSTOM_REASONING_API_KEY;

    const migrated = [];
    try {
      for (const name of SECRET_KEYS) {
        const value = process.env[name];
        if (!value) continue;
        await this._saveSecretKey(name, value);
        // Round-trip verify before stripping plaintext .env.
        const buffer = await fsPromises.readFile(this._getSecretFilePath(name));
        if (secretCrypto.decrypt(buffer).value !== value) {
          throw new Error(`round-trip verification failed for ${name}`);
        }
        migrated.push(name);
      }
    } catch (error) {
      debugLogger.error(
        "Secret migration aborted — plaintext .env preserved",
        { error: error.message, migrated },
        "environment"
      );
      return;
    }

    // Write sentinel before stripping plaintext from .env so a crash mid-rewrite is recoverable.
    await fsPromises.writeFile(this._getMigrationSentinelPath(), "");
    const envPath = path.join(app.getPath("userData"), ".env");
    if (fs.existsSync(envPath)) await this._writeEnvFileAtomic(envPath);
    debugLogger.info(
      "Migrated secrets to encrypted storage",
      { count: migrated.length },
      "environment"
    );
  }

  _writeEnvFileAtomic(envPath) {
    // Concurrent write+rename pairs share the same .env.tmp path, and the
    // loser's rename throws ENOENT (#903).
    envWriteQueue = envWriteQueue.catch(() => {}).then(() => this._writeEnvFile(envPath));
    return envWriteQueue;
  }

  async _writeEnvFile(envPath) {
    // Only strip plaintext secrets once migration has fully completed —
    // otherwise a partial-migration recovery can lose unencrypted secrets.
    const stripSecrets =
      this._encryptionAvailable() && fs.existsSync(this._getMigrationSentinelPath());
    let envContent = "# Oats Environment Variables\n";
    for (const key of PERSISTED_KEYS) {
      if (stripSecrets && SECRET_KEY_SET.has(key)) continue;
      if (process.env[key]) {
        envContent += `${key}=${process.env[key]}\n`;
      }
    }
    const tmpPath = `${envPath}.tmp`;
    await fsPromises.writeFile(tmpPath, envContent, "utf8");
    await fsPromises.rename(tmpPath, envPath);
  }

  _getKey(envVarName) {
    return process.env[envVarName] || "";
  }

  _saveKey(envVarName, key) {
    if (SECRET_KEY_SET.has(envVarName) && this._encryptionAvailable()) {
      this._saveSecretKey(envVarName, key).catch((error) => {
        debugLogger.error(
          "Failed to persist encrypted secret",
          { key: envVarName, error: error.message },
          "environment"
        );
      });
    } else if (key) {
      process.env[envVarName] = key;
    } else {
      delete process.env[envVarName];
    }
    return { success: true };
  }

  // --- Named keys --------------------------------------------------------
  //
  // More than one OpenAI or Anthropic key, each with a name, and the key each
  // feature uses on the API-key route; helpers/apiKeys.mjs holds the rules.
  // Each key's secret is its own file in secure-keys, encrypted like the
  // other secrets (`api-key-<id>.enc`; `.plain` only where nothing can
  // encrypt, as `.env` is then). Their records hold no secret and sit in
  // `api-keys.json` beside them: id, provider, name, the last four
  // characters, when the key was added, what the provider said of it, and
  // the key each feature uses. Each provider's single slot (OPENAI_API_KEY)
  // keeps its default key, its oldest, so every path that does not know
  // features works as before. Secrets stay in this process: the records go
  // to the windows, and a secret only to a window that asks for one key.

  _keyListPath() {
    return path.join(this._getSecureKeysDir(), KEY_LIST_FILE);
  }

  _keyFilePath(id, form) {
    if (!KEY_ID.test(String(id))) throw new Error("invalid key id");
    return path.join(this._getSecureKeysDir(), `api-key-${id}.${form}`);
  }

  /**
   * A secret as a key may hold it: one printable word, of a sane length, and
   * not the placeholder `.env.example` holds.
   */
  _cleanKeySecret(secret) {
    const value = typeof secret === "string" ? secret.trim() : "";
    if (value.length < 8 || value.length > KEY_SECRET_MAX) return "";
    if (!/^[\x21-\x7e]+$/.test(value) || /^your_\w+_here$/i.test(value)) return "";
    return value;
  }

  _newKeyId() {
    let id;
    do id = `k${crypto.randomBytes(8).toString("hex")}`;
    while (this._keyList?.keys.some((key) => key.id === id));
    return id;
  }

  /** A record for a key not saved before: added after every key there is. */
  _newKeyRecord(provider, secret, { name = "", number, status = null } = {}) {
    const rules = this._keyRules;
    const keys = this._keyList?.keys ?? [];
    const defaults = keys.filter((key) => key.provider === provider && !key.name);
    const next = 1 + Math.max(0, ...defaults.map((key) => key.number));
    const latest = Math.max(0, ...keys.map((key) => key.addedAt));
    return {
      id: this._newKeyId(),
      provider,
      name: rules.cleanKeyName(name),
      number: Number.isInteger(number) && number > 0 && number < 1e6 ? number : next,
      tail: secret.slice(-4),
      addedAt: Math.max(Date.now(), latest + 1),
      status: rules.isKeyStatus(status) ? status : null,
    };
  }

  async _readKeySecret(id) {
    for (const form of ["enc", "plain"]) {
      let buffer;
      try {
        buffer = await fsPromises.readFile(this._keyFilePath(id, form));
      } catch (error) {
        if (error.code === "ENOENT") continue;
        debugLogger.error("Could not read a saved key", { code: error.code }, "environment");
        return { unreadable: true };
      }
      try {
        if (form === "enc") {
          const { value, needsReencrypt } = secretCrypto.decrypt(buffer);
          if (needsReencrypt) await this._writeKeySecret(id, value).catch(() => {});
          return { secret: value };
        }
        const value = buffer.toString("utf8").trim();
        // A key saved where nothing could encrypt, encrypted once something can.
        if (this._encryptionAvailable()) await this._writeKeySecret(id, value).catch(() => {});
        return { secret: value };
      } catch (error) {
        debugLogger.error(
          "Failed to decrypt a saved key — user must re-enter",
          { code: error.code, error: error.message },
          "environment"
        );
        return { unreadable: true };
      }
    }
    return { missing: true };
  }

  async _writeKeySecret(id, secret) {
    await fsPromises.mkdir(this._getSecureKeysDir(), { recursive: true });
    const encrypted = this._encryptionAvailable();
    const file = this._keyFilePath(id, encrypted ? "enc" : "plain");
    const tmp = `${file}.tmp`;
    await fsPromises.writeFile(tmp, encrypted ? secretCrypto.encrypt(secret) : secret, {
      mode: 0o600,
    });
    await fsPromises.rename(tmp, file);
    await fsPromises.unlink(this._keyFilePath(id, encrypted ? "plain" : "enc")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async _deleteKeySecret(id) {
    for (const form of ["enc", "plain"]) {
      await fsPromises.unlink(this._keyFilePath(id, form)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  /**
   * Read the keys at launch. The list says which keys exist: a key whose file
   * is gone was removed, and a file the list does not name is a key whose
   * adding never finished, so it is deleted. Without a list that can be read,
   * the files are the keys. A key that cannot be decrypted now stays on disk
   * for a later launch that can. The first time this runs, each provider's one
   * key becomes "<Provider> key 1", chosen for every feature that uses that
   * provider; so does a key an earlier version put in an empty slot. Nothing
   * here can stop the launch: on a failure, the slots' keys serve this session.
   */
  async _loadApiKeys() {
    this._keyRules = await import("./apiKeys.mjs");
    this._keySecrets = new Map();
    this._keyList = { keys: [], features: {} };
    let changed = false;
    try {
      changed = await this._readKeyFiles();
    } catch (error) {
      debugLogger.error("Could not read the saved keys", { error: error.message }, "environment");
      this._keySecrets = new Map();
      this._keyList = { keys: [], features: {} };
    }
    const adopted = [];
    for (const [provider, env] of Object.entries(NAMED_KEY_SLOTS)) {
      if (this._keyList.keys.some((key) => key.provider === provider)) continue;
      const secret = this._cleanKeySecret(process.env[env]);
      if (!secret) continue;
      const record = this._newKeyRecord(provider, secret);
      this._keyList.keys.push(record);
      this._keySecrets.set(record.id, secret);
      adopted.push(record);
    }
    if (adopted.length) {
      this._keyList.features = this._keyRules.slotKeyChoices(adopted, this._keyList.features);
      changed = true;
      debugLogger.info(
        "Gave the saved keys names",
        { count: adopted.length, keys: this._keyList.keys.length },
        "environment"
      );
    }
    this._keyList = this._keyRules.normalizeKeyRecords(this._keyList);
    if (changed || Object.keys(this._slotChanges()).length) {
      await this._persistKeys({ write: adopted.map((key) => key.id) }).catch((error) =>
        this._keyWriteFailed(error)
      );
    }
  }

  /** Read the list and the secrets it names. True when the list must be written again. */
  async _readKeyFiles() {
    const rules = this._keyRules;
    let raw = null;
    let trusted = false;
    let changed = false;
    try {
      raw = JSON.parse(await fsPromises.readFile(this._keyListPath(), "utf8"));
      trusted = Boolean(raw) && typeof raw === "object";
    } catch (error) {
      if (error.code !== "ENOENT") {
        debugLogger.error(
          "The list of saved keys could not be read",
          { code: error.code, error: error.message },
          "environment"
        );
      }
    }
    if (raw !== null && !trusted) changed = true;
    if (!trusted && fs.existsSync(this._keyListPath())) {
      // Kept aside for a person to look at, never read again.
      await fsPromises
        .rename(this._keyListPath(), `${this._keyListPath()}.unreadable-${Date.now()}`)
        .catch(() => {});
      changed = true;
    }
    const listed = rules.normalizeKeyRecords(trusted ? raw : null);
    for (const key of listed.keys) {
      const found = await this._readKeySecret(key.id);
      if (found.missing) {
        changed = true;
        continue;
      }
      if (found.secret) {
        this._keySecrets.set(key.id, found.secret);
        if (key.tail !== found.secret.slice(-4)) {
          key.tail = found.secret.slice(-4);
          changed = true;
        }
      }
      this._keyList.keys.push(key);
    }
    this._keyList.features = rules.cleanFeatureKeys(listed.features, this._keyList.keys);

    let files = [];
    try {
      files = await fsPromises.readdir(this._getSecureKeysDir());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const found = [];
    for (const file of files) {
      const id = KEY_FILE.exec(file)?.[1];
      if (!id || this._keyList.keys.some((key) => key.id === id) || found.includes(id)) continue;
      found.push(id);
      if (trusted) {
        await this._deleteKeySecret(id);
        continue;
      }
      const secret = (await this._readKeySecret(id)).secret;
      if (!secret) continue;
      const provider = secret.startsWith("sk-ant-") ? "anthropic" : "openai";
      const stat = await fsPromises.stat(this._keyFilePath(id, "enc")).catch(() => null);
      this._keyList.keys.push({
        ...this._newKeyRecord(provider, secret),
        id,
        addedAt: stat ? Math.floor(stat.mtimeMs) : Date.now(),
      });
      this._keySecrets.set(id, secret);
      changed = true;
    }
    if (!trusted && this._keyList.keys.length) {
      this._keyList.features = rules.slotKeyChoices(
        rules.normalizeKeyRecords(this._keyList).keys,
        this._keyList.features
      );
    }
    return changed;
  }

  /** The records whose secret this process holds. */
  _readableKeys() {
    const keys = (this._keyList?.keys ?? []).filter((key) => this._keySecrets?.has(key.id));
    return { keys, features: this._keyRules.cleanFeatureKeys(this._keyList.features, keys) };
  }

  /**
   * The slots to change: a provider's slot holds its default key's secret. A
   * provider with no key keeps its slot as it is, unless it is in `clear`
   * (its last key was just removed) and has no key this launch cannot read.
   */
  _slotChanges(clear = []) {
    const readable = this._readableKeys();
    const changes = {};
    for (const [provider, env] of Object.entries(NAMED_KEY_SLOTS)) {
      const key = this._keyRules.defaultKeyOf(readable, provider);
      const unread = this._keyList.keys.some((candidate) => candidate.provider === provider);
      const value = key
        ? this._keySecrets.get(key.id)
        : clear.includes(provider) && !unread
          ? ""
          : null;
      if (value !== null && (process.env[env] || "") !== value) changes[env] = value;
    }
    return changes;
  }

  /**
   * Make memory the keys as they are now, then write them, in an order a
   * crash cannot turn into a key the person removed: new secrets first, then
   * each provider's slot, then removed secrets deleted, then the list.
   */
  _persistKeys({ write = [], remove = [], clear = [] } = {}) {
    const slots = this._slotChanges(clear);
    for (const [env, value] of Object.entries(slots)) {
      if (value) process.env[env] = value;
      else delete process.env[env];
    }
    const secrets = write
      .map((id) => [id, this._keySecrets.get(id)])
      .filter(([, secret]) => secret);
    const list = JSON.stringify(
      {
        version: 1,
        keys: this._keyList.keys.map(this._keyRules.publicKeyRecord),
        features: this._keyList.features,
      },
      null,
      2
    );
    keyWriteQueue = keyWriteQueue
      .catch(() => {})
      .then(async () => {
        for (const [id, secret] of secrets) await this._writeKeySecret(id, secret);
        await this._writeSlots(slots);
        for (const id of remove) await this._deleteKeySecret(id);
        await fsPromises.mkdir(this._getSecureKeysDir(), { recursive: true });
        const tmp = `${this._keyListPath()}.tmp`;
        await fsPromises.writeFile(tmp, list, { encoding: "utf8", mode: 0o600 });
        await fsPromises.rename(tmp, this._keyListPath());
      });
    return keyWriteQueue;
  }

  /**
   * The slots' files. Memory already holds the new values (`_persistKeys`),
   * so this writes files only: a write still queued never puts an older
   * value back in `process.env`.
   */
  async _writeSlots(slots) {
    const entries = Object.entries(slots);
    if (!entries.length) return;
    if (!this._encryptionAvailable()) {
      await this.saveAllKeysToEnvFile();
      return;
    }
    await fsPromises.mkdir(this._getSecureKeysDir(), { recursive: true });
    for (const [env, value] of entries) {
      const file = this._getSecretFilePath(env);
      if (!value) {
        await fsPromises.unlink(file).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        continue;
      }
      const tmp = `${file}.tmp`;
      await fsPromises.writeFile(tmp, secretCrypto.encrypt(value), { mode: 0o600 });
      await fsPromises.rename(tmp, file);
    }
  }

  _keysChanged() {
    try {
      this.onApiKeysChanged?.(this.listApiKeys());
    } catch (error) {
      debugLogger.warn("Could not tell the windows of a key change", { error: error.message });
    }
  }

  /** The saved keys' records and each feature's key: what the windows see. No secret. */
  listApiKeys() {
    if (!this._keyRules || !this._keyList) return { keys: [], features: {} };
    const readable = this._readableKeys();
    return {
      keys: readable.keys.map(this._keyRules.publicKeyRecord),
      features: readable.features,
    };
  }

  /** One key's secret, for a window that calls the provider itself. */
  getApiKeySecret(id) {
    return (this._keyList && this._keySecrets.get(String(id))) || "";
  }

  /**
   * The secret a feature's call to a provider uses: the key chosen for that
   * feature, else the provider's oldest usable key (helpers/apiKeys.mjs), else
   * the provider's slot as before.
   */
  getFeatureKey(feature, provider) {
    const env = NAMED_KEY_SLOTS[provider];
    if (this._keyRules && this._keyList && this._keyRules.isFeature(feature)) {
      const key = this._keyRules.resolveFeatureKey(this._readableKeys(), feature, provider);
      if (key) return this._keySecrets.get(key.id) || "";
    }
    return env ? this._getKey(env) : "";
  }

  /** A provider's key for a call: the feature's when the call names one, else the slot. */
  getProviderKey(provider, feature) {
    if (feature && this._keyRules?.isFeature(feature)) return this.getFeatureKey(feature, provider);
    const env = NAMED_KEY_SLOTS[provider];
    return env ? this._getKey(env) : "";
  }

  /**
   * Save a key checked with its provider in the window (keyCheck.ts). `assign`
   * names the features it is now chosen for. A secret already saved is not
   * saved twice: that key is the answer, renamed when a name is given.
   */
  async addApiKey(request = {}) {
    const rules = this._keyRules;
    if (!rules || !this._keyList) return { ok: false, reason: "not-ready" };
    const provider = request.provider;
    const secret = this._cleanKeySecret(request.secret);
    if (!rules.isKeyProvider(provider) || !secret) return { ok: false, reason: "invalid" };
    const assign = (Array.isArray(request.assign) ? request.assign : []).filter((feature) =>
      rules.keyServes(provider, feature)
    );
    const existing = this._keyList.keys.find(
      (key) => key.provider === provider && this._keySecrets.get(key.id) === secret
    );
    if (existing) {
      const name = rules.cleanKeyName(request.name);
      if (name) existing.name = name;
      if (rules.isKeyStatus(request.status)) existing.status = request.status;
      for (const feature of assign) this._keyList.features[feature] = existing.id;
      await this._persistKeys().catch((error) => this._keyWriteFailed(error));
      this._keysChanged();
      return { ok: true, id: existing.id, list: this.listApiKeys() };
    }
    const record = this._newKeyRecord(provider, secret, request);
    try {
      await this._writeKeySecret(record.id, secret);
    } catch (error) {
      this._keyWriteFailed(error);
      return { ok: false, reason: "not-saved" };
    }
    this._keyList.keys.push(record);
    this._keySecrets.set(record.id, secret);
    for (const feature of assign) this._keyList.features[feature] = record.id;
    this._keyList = rules.normalizeKeyRecords(this._keyList);
    const saved = await this._persistKeys().then(
      () => true,
      (error) => this._keyWriteFailed(error)
    );
    this._keysChanged();
    return saved
      ? { ok: true, id: record.id, list: this.listApiKeys() }
      : { ok: false, reason: "not-saved" };
  }

  /** Put another secret of the same provider in a key's place: same id, same features. */
  async replaceApiKey(id, request = {}) {
    const rules = this._keyRules;
    const record = this._keyList?.keys.find((key) => key.id === id);
    const secret = this._cleanKeySecret(request.secret);
    if (!rules || !record || !secret) return { ok: false, reason: "invalid" };
    try {
      await this._writeKeySecret(record.id, secret);
    } catch (error) {
      this._keyWriteFailed(error);
      return { ok: false, reason: "not-saved" };
    }
    this._keySecrets.set(record.id, secret);
    record.tail = secret.slice(-4);
    record.status = rules.isKeyStatus(request.status) ? request.status : null;
    const name = rules.cleanKeyName(request.name);
    if (name) record.name = name;
    const saved = await this._persistKeys().then(
      () => true,
      (error) => this._keyWriteFailed(error)
    );
    this._keysChanged();
    return saved ? { ok: true, list: this.listApiKeys() } : { ok: false, reason: "not-saved" };
  }

  async renameApiKey(id, name, number) {
    const record = this._keyList?.keys.find((key) => key.id === id);
    if (!record) return null;
    record.name = this._keyRules.cleanKeyName(name);
    if (Number.isInteger(number) && number > 0 && number < 1e6) record.number = number;
    await this._persistKeys().catch((error) => this._keyWriteFailed(error));
    this._keysChanged();
    return this.listApiKeys();
  }

  /**
   * Remove a key and delete its secret. `features` is where the window moved
   * the features that used it (helpers/apiKeys.mjs, `removalPlan`); a choice
   * it does not name is kept, unless it was the removed key.
   */
  async removeApiKey(id, features) {
    const rules = this._keyRules;
    const removed = this._keyList?.keys.find((key) => key.id === id);
    if (!rules || !removed) return null;
    this._keySecrets.delete(id);
    const keys = this._keyList.keys.filter((key) => key.id !== id);
    const kept = Object.fromEntries(
      Object.entries(this._keyList.features).filter(([, chosen]) => chosen !== id)
    );
    const moved = rules.cleanFeatureKeys(features, keys);
    this._keyList = { keys, features: rules.cleanFeatureKeys({ ...kept, ...moved }, keys) };
    await this._persistKeys({ remove: [id], clear: [removed.provider] }).catch((error) =>
      this._keyWriteFailed(error)
    );
    this._keysChanged();
    return this.listApiKeys();
  }

  /**
   * The key each feature uses on the API-key route. A feature not named, or
   * named with a key that cannot serve it, keeps its key.
   */
  async setFeatureApiKeys(features) {
    if (!this._keyRules || !this._keyList) return null;
    const chosen = this._keyRules.cleanFeatureKeys(features, this._keyList.keys);
    this._keyList.features = this._keyRules.cleanFeatureKeys(
      { ...this._keyList.features, ...chosen },
      this._keyList.keys
    );
    await this._persistKeys().catch((error) => this._keyWriteFailed(error));
    this._keysChanged();
    return this.listApiKeys();
  }

  /** What the provider said of a key, kept with it. */
  async setApiKeyStatus(id, status) {
    const record = this._keyList?.keys.find((key) => key.id === id);
    if (!record) return null;
    record.status = this._keyRules.isKeyStatus(status) ? status : null;
    await this._persistKeys().catch((error) => this._keyWriteFailed(error));
    this._keysChanged();
    return this.listApiKeys();
  }

  _keyWriteFailed(error) {
    debugLogger.error(
      "Failed to save the keys",
      { code: error?.code, error: error?.message },
      "environment"
    );
    return false;
  }

  /**
   * The single slot's setter for OpenAI and Anthropic (`save-openai-key`):
   * the paths that do not know features, such as the Advanced pickers. A key
   * replaces the provider's default key, or is its first; an empty one
   * removes the default key, and the next oldest becomes the default. Before
   * the keys are read (init), only the slot changes, as before.
   */
  _saveNamedSlot(provider, value) {
    const env = NAMED_KEY_SLOTS[provider];
    const rules = this._keyRules;
    if (!rules || !this._keyList) return this._saveKey(env, value);
    const typed = typeof value === "string" ? value.trim() : "";
    const secret = this._cleanKeySecret(typed);
    // Text that cannot be a key (a space in it, too short) changes nothing;
    // the windows read the slot again, so they show what is saved.
    if (typed && !secret) {
      this._keysChanged();
      return { success: false };
    }
    const current = rules.defaultKeyOf(this._readableKeys(), provider);
    if (secret && current) {
      if (this._keySecrets.get(current.id) !== secret) {
        this._keySecrets.set(current.id, secret);
        current.tail = secret.slice(-4);
        current.status = null;
        this._persistKeys({ write: [current.id] }).catch((error) => this._keyWriteFailed(error));
      }
    } else if (secret) {
      const before = this._readableKeys();
      const record = this._newKeyRecord(provider, secret);
      this._keyList.keys.push(record);
      this._keySecrets.set(record.id, secret);
      for (const feature of rules.featuresForNewKey(before, provider)) {
        this._keyList.features[feature] = record.id;
      }
      this._keyList = rules.normalizeKeyRecords(this._keyList);
      this._persistKeys({ write: [record.id] }).catch((error) => this._keyWriteFailed(error));
    } else if (current) {
      this._keySecrets.delete(current.id);
      const keys = this._keyList.keys.filter((key) => key.id !== current.id);
      const features = {};
      for (const [feature, chosen] of Object.entries(this._keyList.features)) {
        if (chosen !== current.id) features[feature] = chosen;
        else {
          const next = keys.find(
            (key) => key.provider === provider && this._keySecrets.has(key.id)
          );
          if (next) features[feature] = next.id;
        }
      }
      this._keyList = { keys, features: rules.cleanFeatureKeys(features, keys) };
      this._persistKeys({ remove: [current.id], clear: [provider] }).catch((error) =>
        this._keyWriteFailed(error)
      );
    } else if (!secret) {
      return this._saveKey(env, "");
    }
    this._keysChanged();
    return { success: true };
  }

  getCustomTranscriptionKey() {
    return this._getKey("CUSTOM_TRANSCRIPTION_API_KEY");
  }

  saveCustomTranscriptionKey(key) {
    return this._saveKey("CUSTOM_TRANSCRIPTION_API_KEY", key);
  }

  getCleanupCustomKey() {
    // TODO: drop CUSTOM_REASONING_API_KEY fallback after 2 releases.
    return this._getKey("CUSTOM_CLEANUP_API_KEY") || this._getKey("CUSTOM_REASONING_API_KEY");
  }

  saveCleanupCustomKey(key) {
    delete process.env.CUSTOM_REASONING_API_KEY;
    return this._saveKey("CUSTOM_CLEANUP_API_KEY", key);
  }

  // Enterprise providers — AWS Bedrock
  getBedrockRegion() {
    return this._getKey("BEDROCK_REGION");
  }
  saveBedrockRegion(value) {
    return this._saveKey("BEDROCK_REGION", value);
  }
  getBedrockProfile() {
    return this._getKey("BEDROCK_PROFILE");
  }
  saveBedrockProfile(value) {
    return this._saveKey("BEDROCK_PROFILE", value);
  }
  getBedrockAccessKeyId() {
    return this._getKey("BEDROCK_ACCESS_KEY_ID");
  }
  saveBedrockAccessKeyId(key) {
    return this._saveKey("BEDROCK_ACCESS_KEY_ID", key);
  }
  getBedrockSecretAccessKey() {
    return this._getKey("BEDROCK_SECRET_ACCESS_KEY");
  }
  saveBedrockSecretAccessKey(key) {
    return this._saveKey("BEDROCK_SECRET_ACCESS_KEY", key);
  }
  getBedrockSessionToken() {
    return this._getKey("BEDROCK_SESSION_TOKEN");
  }
  saveBedrockSessionToken(key) {
    return this._saveKey("BEDROCK_SESSION_TOKEN", key);
  }

  // Enterprise providers — Azure OpenAI
  getAzureEndpoint() {
    return this._getKey("AZURE_OPENAI_ENDPOINT");
  }
  saveAzureEndpoint(value) {
    return this._saveKey("AZURE_OPENAI_ENDPOINT", value);
  }
  getAzureApiKey() {
    return this._getKey("AZURE_OPENAI_API_KEY");
  }
  saveAzureApiKey(key) {
    return this._saveKey("AZURE_OPENAI_API_KEY", key);
  }
  getAzureDeployment() {
    return this._getKey("AZURE_OPENAI_DEPLOYMENT");
  }
  saveAzureDeployment(value) {
    return this._saveKey("AZURE_OPENAI_DEPLOYMENT", value);
  }
  getAzureApiVersion() {
    return this._getKey("AZURE_OPENAI_API_VERSION");
  }
  saveAzureApiVersion(value) {
    return this._saveKey("AZURE_OPENAI_API_VERSION", value);
  }

  // Enterprise providers — GCP Vertex AI
  getVertexProject() {
    return this._getKey("VERTEX_PROJECT");
  }
  saveVertexProject(value) {
    return this._saveKey("VERTEX_PROJECT", value);
  }
  getVertexLocation() {
    return this._getKey("VERTEX_LOCATION");
  }
  saveVertexLocation(value) {
    return this._saveKey("VERTEX_LOCATION", value);
  }
  getVertexApiKey() {
    return this._getKey("VERTEX_API_KEY");
  }
  saveVertexApiKey(key) {
    return this._saveKey("VERTEX_API_KEY", key);
  }

  getDictationKey() {
    return this._getKey("DICTATION_KEY");
  }

  saveDictationKey(key) {
    const result = this._saveKey("DICTATION_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getAgentKey() {
    // TODO: drop AGENT_KEY fallback after 2 releases.
    return this._getKey("CHAT_AGENT_KEY") || this._getKey("AGENT_KEY");
  }

  saveAgentKey(key) {
    delete process.env.AGENT_KEY;
    const result = this._saveKey("CHAT_AGENT_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getConversationKey() {
    return this._getKey("CONVERSATION_KEY");
  }

  saveConversationKey(key) {
    return this._saveKey("CONVERSATION_KEY", key);
  }

  getVoiceAgentKey() {
    return this._getKey("VOICE_AGENT_KEY");
  }

  getSearchKey() {
    return this._getKey("SEARCH_KEY");
  }

  saveSearchKey(key) {
    const result = this._saveKey("SEARCH_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  saveVoiceAgentKey(key) {
    const result = this._saveKey("VOICE_AGENT_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getTranslationKey() {
    return this._getKey("TRANSLATION_KEY");
  }

  saveTranslationKey(key) {
    const result = this._saveKey("TRANSLATION_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getMeetingKey() {
    return this._getKey("MEETING_KEY");
  }

  saveMeetingKey(key) {
    const result = this._saveKey("MEETING_KEY", key);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getActivationMode() {
    const mode = this._getKey("ACTIVATION_MODE");
    return mode === "push" ? "push" : "tap";
  }

  saveActivationMode(mode) {
    const validMode = mode === "push" ? "push" : "tap";
    const result = this._saveKey("ACTIVATION_MODE", validMode);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  // Off on macOS and on elsewhere until the user chooses. An unset value is the
  // platform default, so an install that never chose keeps following it.
  // The renderer's twin is `resolveDictationEnabled` in dictationSetting.mjs.
  getDictationEnabled() {
    const stored = this._getKey("DICTATION_ENABLED");
    if (stored === "true") return true;
    if (stored === "false") return false;
    return process.platform !== "darwin";
  }

  // Awaited by the caller: turning dictation on can bind the default key, which
  // makes hotkeyManager build its own EnvironmentManager, and that reloads .env
  // with override. A choice not yet on disk would be read back as the old one.
  async saveDictationEnabled(enabled) {
    const result = this._saveKey("DICTATION_ENABLED", String(enabled === true));
    await this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getFloatingIconAutoHide() {
    return this._getKey("FLOATING_ICON_AUTO_HIDE") === "true";
  }

  saveFloatingIconAutoHide(enabled) {
    const result = this._saveKey("FLOATING_ICON_AUTO_HIDE", String(enabled));
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getStartMinimized() {
    return this._getKey("START_MINIMIZED") === "true";
  }

  saveStartMinimized(enabled) {
    const result = this._saveKey("START_MINIMIZED", String(enabled));
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  getPanelStartPosition() {
    const v = this._getKey("PANEL_START_POSITION");
    if (v === "bottom-right" || v === "center" || v === "bottom-left") return v;
    return "bottom-right";
  }

  savePanelStartPosition(position) {
    const result = this._saveKey("PANEL_START_POSITION", position);
    this.saveAllKeysToEnvFile().catch(() => {});
    return result;
  }

  // The speech language the launch pre-warm loads Whisper for: main's copy of
  // the renderer's setting, synced by `sync-startup-preferences`. Unset (a new
  // install, or one that last synced while "auto" was the default and was
  // stored as nothing) is the default, English. Detection is stored as "auto".
  // Its twin is `startupSpeechLanguage` in src/helpers/speechLanguage.mjs, and
  // test/helpers/speechLanguage.test.js holds the two to the same answers.
  getSpeechLanguage() {
    return this._getKey("LOCAL_WHISPER_LANGUAGE").trim() || "en";
  }

  getUiLanguage() {
    return normalizeUiLanguage(this._getKey("UI_LANGUAGE"));
  }

  saveUiLanguage(language) {
    const normalized = normalizeUiLanguage(language);
    const result = this._saveKey("UI_LANGUAGE", normalized);
    this.saveAllKeysToEnvFile().catch(() => {});
    return { ...result, language: normalized };
  }

  async saveAllKeysToEnvFile() {
    const envPath = path.join(app.getPath("userData"), ".env");
    await this._writeEnvFileAtomic(envPath);
    require("dotenv").config({ path: envPath });
    return { success: true, path: envPath };
  }
}

// Generate the uniform BYOK key accessors (getOpenAIKey/saveOpenAIKey/…) from
// the shared manifest so each provider is defined in exactly one place.
for (const k of BYOK_API_KEYS) {
  EnvironmentManager.prototype[k.get] = function () {
    return this._getKey(k.env);
  };
  EnvironmentManager.prototype[k.save] = k.named
    ? function (key) {
        return this._saveNamedSlot(k.base, key);
      }
    : function (key) {
        return this._saveKey(k.env, key);
      };
}

module.exports = EnvironmentManager;
