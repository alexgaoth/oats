const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const Module = require("module");

// Named keys in the main process (environment.js): one encrypted file per
// key, a list that holds no secret, each provider's slot kept on its default
// key, the migration of the one key per provider, and the key each feature's
// call uses. The OS keyring is never loaded, and electron's safeStorage is a
// stand-in that scrambles reversibly, so secretCrypto takes its safeStorage
// path. Every secret here is a fake.

const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), "oats-keys-test-"));
const scramble = (text) =>
  Buffer.from(`fake:${Buffer.from(text, "utf8").toString("base64")}`).reverse();
const unscramble = (buffer) => {
  const text = Buffer.from(buffer).reverse().toString("utf8");
  if (!text.startsWith("fake:")) throw new Error("not a fake blob");
  return Buffer.from(text.slice(5), "base64").toString("utf8");
};
const fakeElectron = {
  app: { getPath: () => tmpUserData, isPackaged: true },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: scramble,
    decryptString: unscramble,
  },
};
// Every line logged, to show that no secret is ever in one.
const logged = [];
const fakeLogger = {};
for (const level of ["trace", "debug", "info", "warn", "error", "fatal", "log"]) {
  fakeLogger[level] = (...args) => logged.push(JSON.stringify(args));
}
fakeLogger.ensureFileLogging = () => {};
fakeLogger.refreshLogLevel = () => {};
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "electron") return fakeElectron;
  if (request === "@napi-rs/keyring") throw new Error("keyring disabled in tests");
  if (
    request === "./debugLogger" &&
    String(parent?.filename).includes(`${path.sep}helpers${path.sep}`)
  ) {
    return fakeLogger;
  }
  return origLoad.call(this, request, parent, ...rest);
};
// Nothing from the shell running the tests may become a key here.
for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[name];

const EnvironmentManager = require("../../src/helpers/environment");

const OPENAI_ONE = "sk-proj-fakeOpenAiKeyOne000AAAA";
const OPENAI_TWO = "sk-proj-fakeOpenAiKeyTwo000BBBB";
const OPENAI_THREE = "sk-proj-fakeOpenAiKeyThree00CCCC";
const ANTHROPIC_ONE = "sk-ant-fakeAnthropicKeyOne0DDDD";
const SECRETS = [OPENAI_ONE, OPENAI_TWO, OPENAI_THREE, ANTHROPIC_ONE];

const dir = path.join(tmpUserData, "secure-keys");
const readList = () => JSON.parse(fs.readFileSync(path.join(dir, "api-keys.json"), "utf8"));
const keyFiles = () =>
  fs
    .readdirSync(dir)
    .filter((file) => /^api-key-/.test(file))
    .sort();
/** Whether any file the app wrote, or any line it logged, holds a secret. */
function leaks() {
  const found = [];
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file)).toString("utf8");
    for (const secret of SECRETS) if (text.includes(secret)) found.push(file);
  }
  for (const line of logged) {
    for (const secret of SECRETS) if (line.includes(secret)) found.push("a log line");
  }
  return found;
}
/** A launch of the app: a new process starts with no slot in its environment. */
async function launch({ keepEnv = false } = {}) {
  if (!keepEnv)
    for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[name];
  const env = new EnvironmentManager();
  const changes = [];
  env.onApiKeysChanged = (list) => changes.push(list);
  await env.init();
  return { env, changes };
}
async function settle(env) {
  // The writes are queued in order; one more write waits for those before it.
  await env.setFeatureApiKeys({});
}

let env;
let changes;

test("an install from before names: its one key per provider becomes key 1, for every feature", async () => {
  // The slots as 0.4.0-beta.3 left them: one encrypted file per provider.
  process.env.OPENAI_API_KEY = OPENAI_ONE;
  process.env.ANTHROPIC_API_KEY = ANTHROPIC_ONE;
  ({ env } = await launch({ keepEnv: true }));
  const list = env.listApiKeys();
  assert.deepEqual(
    list.keys.map((key) => [key.provider, key.name, key.number, key.tail, key.status]),
    [
      ["openai", "", 1, "AAAA", null],
      ["anthropic", "", 1, "DDDD", null],
    ]
  );
  const [openai, anthropic] = list.keys;
  assert.deepEqual(list.features, { conversations: openai.id, dictation: openai.id });
  // Each feature's call uses the key it used before: the same secret.
  assert.equal(env.getFeatureKey("conversations", "openai"), OPENAI_ONE);
  assert.equal(env.getFeatureKey("dictation", "openai"), OPENAI_ONE);
  assert.equal(env.getFeatureKey("writing", "openai"), OPENAI_ONE);
  assert.equal(env.getFeatureKey("writing", "anthropic"), ANTHROPIC_ONE);
  assert.equal(env.getOpenAIKey(), OPENAI_ONE);
  assert.equal(env.getAnthropicKey(), ANTHROPIC_ONE);
  // One encrypted file per key, and the slots kept.
  assert.deepEqual(keyFiles(), [`api-key-${openai.id}.enc`, `api-key-${anthropic.id}.enc`].sort());
  assert.ok(fs.existsSync(path.join(dir, "OPENAI_API_KEY.enc")));
  assert.equal(readList().keys.length, 2);
  assert.deepEqual(leaks(), []);
});

test("a second launch reads the same keys back, and writes nothing new", async () => {
  const before = readList();
  const stamp = fs.statSync(path.join(dir, "api-keys.json")).mtimeMs;
  ({ env, changes } = await launch());
  assert.deepEqual(env.listApiKeys(), { keys: before.keys, features: before.features });
  assert.equal(fs.statSync(path.join(dir, "api-keys.json")).mtimeMs, stamp);
  assert.equal(changes.length, 0);
});

test("a key is added with its name, and a feature can use it while another keeps key 1", async () => {
  const result = await env.addApiKey({
    provider: "openai",
    secret: OPENAI_TWO,
    name: "Work",
    number: 2,
    status: "ok",
    assign: ["conversations"],
  });
  assert.equal(result.ok, true);
  const added = result.list.keys.find((key) => key.id === result.id);
  assert.deepEqual([added.name, added.tail, added.status], ["Work", "BBBB", "ok"]);
  assert.equal(env.getFeatureKey("conversations", "openai"), OPENAI_TWO);
  assert.equal(env.getFeatureKey("dictation", "openai"), OPENAI_ONE);
  // The slot keeps the default key, the oldest.
  assert.equal(env.getOpenAIKey(), OPENAI_ONE);
  assert.equal(changes.length, 1);
  // The windows get the records only.
  for (const secret of SECRETS) assert.equal(JSON.stringify(changes).includes(secret), false);
  assert.equal(env.getApiKeySecret(result.id), OPENAI_TWO);
  // The same secret twice is one key.
  const again = await env.addApiKey({ provider: "openai", secret: OPENAI_TWO, assign: [] });
  assert.equal(again.id, result.id);
  assert.equal(env.listApiKeys().keys.length, 3);
  // A key that cannot be a key is refused.
  for (const secret of ["", "short", "sk-has a space-0000000", 42]) {
    assert.equal((await env.addApiKey({ provider: "openai", secret })).ok, false);
  }
  assert.equal((await env.addApiKey({ provider: "gemini", secret: OPENAI_THREE })).ok, false);
  // An Anthropic key is never a speech feature's.
  await env.setFeatureApiKeys({ dictation: env.listApiKeys().keys[1].id });
  assert.equal(env.getFeatureKey("dictation", "openai"), OPENAI_ONE);
  assert.deepEqual(leaks(), []);
});

test("a rename keeps the key; an unknown id changes nothing and builds no path", async () => {
  const work = env.listApiKeys().keys.find((key) => key.name === "Work");
  const renamed = await env.renameApiKey(work.id, "  Client\nA ", 2);
  assert.equal(renamed.keys.find((key) => key.id === work.id).name, "Client A");
  assert.equal(await env.renameApiKey("../../evil", "x"), null);
  assert.equal(await env.removeApiKey("../../evil", {}), null);
  assert.equal(env.getApiKeySecret("../../evil"), "");
});

test("removing the default key deletes its secret and moves the slot to the next key", async () => {
  const [one, , two] = env.listApiKeys().keys;
  assert.equal(two.tail, "BBBB");
  const list = await env.removeApiKey(one.id, { dictation: two.id });
  assert.deepEqual(
    list.keys.map((key) => key.tail),
    ["DDDD", "BBBB"]
  );
  assert.equal(list.features.dictation, two.id);
  assert.equal(list.features.conversations, two.id);
  assert.equal(fs.existsSync(path.join(dir, `api-key-${one.id}.enc`)), false);
  assert.equal(env.getOpenAIKey(), OPENAI_TWO);
  assert.equal(unscramble(fs.readFileSync(path.join(dir, "OPENAI_API_KEY.enc"))), OPENAI_TWO);
  assert.equal(env.getApiKeySecret(one.id), "");
  assert.deepEqual(leaks(), []);
});

test("the single slot's setter replaces the default key, keeping its name and features", async () => {
  const before = env.listApiKeys().keys.find((key) => key.provider === "openai");
  assert.deepEqual(env.saveOpenAIKey(OPENAI_THREE), { success: true });
  // At once, as before: the paths that read the slot see it.
  assert.equal(env.getOpenAIKey(), OPENAI_THREE);
  await settle(env);
  const after = env.listApiKeys().keys.find((key) => key.id === before.id);
  assert.deepEqual([after.name, after.tail, after.status], ["Client A", "CCCC", null]);
  assert.equal(env.getFeatureKey("conversations", "openai"), OPENAI_THREE);
  // Text that cannot be a key changes nothing.
  assert.deepEqual(env.saveOpenAIKey("not a key"), { success: false });
  assert.equal(env.getOpenAIKey(), OPENAI_THREE);
  assert.deepEqual(leaks(), []);
});

test("a key whose adding never finished is deleted at launch; a removal cut short ends removed", async () => {
  await settle(env);
  // A secret written for a key the list never named: the app quit mid-add.
  const orphan = "k00000000000000ff";
  fs.writeFileSync(path.join(dir, `api-key-${orphan}.enc`), scramble(OPENAI_ONE));
  // A removal's first two steps, slot then secret, and no third: the list
  // still names the key.
  const anthropic = env.listApiKeys().keys.find((key) => key.provider === "anthropic");
  fs.unlinkSync(path.join(dir, "ANTHROPIC_API_KEY.enc"));
  fs.unlinkSync(path.join(dir, `api-key-${anthropic.id}.enc`));
  assert.equal(readList().keys.length, 2);
  ({ env } = await launch());
  assert.equal(fs.existsSync(path.join(dir, `api-key-${orphan}.enc`)), false);
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => key.provider),
    ["openai"]
  );
  assert.equal(readList().keys.length, 1);
  assert.equal(env.getAnthropicKey(), "");
  assert.deepEqual(leaks(), []);
});

test("removing a provider's last key clears its slot, and a launch does not bring it back", async () => {
  const added = await env.addApiKey({
    provider: "anthropic",
    secret: ANTHROPIC_ONE,
    number: 1,
    status: "ok",
    assign: ["writing", "dictation"],
  });
  assert.equal(added.ok, true);
  // Chosen for Writing only: an Anthropic key does not transcribe.
  assert.deepEqual(Object.keys(added.list.features).sort(), [
    "conversations",
    "dictation",
    "writing",
  ]);
  assert.equal(added.list.features.writing, added.id);
  assert.notEqual(added.list.features.dictation, added.id);
  assert.equal(env.getAnthropicKey(), ANTHROPIC_ONE);
  assert.equal(env.getFeatureKey("writing", "anthropic"), ANTHROPIC_ONE);
  const list = await env.removeApiKey(added.id, {});
  assert.equal(
    list.keys.some((key) => key.provider === "anthropic"),
    false
  );
  assert.equal(list.features.writing, undefined);
  assert.equal(env.getAnthropicKey(), "");
  assert.equal(env.getFeatureKey("writing", "anthropic"), "");
  assert.equal(fs.existsSync(path.join(dir, "ANTHROPIC_API_KEY.enc")), false);
  assert.equal(fs.existsSync(path.join(dir, `api-key-${added.id}.enc`)), false);
  ({ env } = await launch());
  assert.equal(
    env.listApiKeys().keys.some((key) => key.provider === "anthropic"),
    false
  );
  assert.equal(env.getAnthropicKey(), "");
});

test("a list that cannot be read is kept aside, and the key files are kept as keys", async () => {
  const before = env.listApiKeys().keys;
  fs.writeFileSync(path.join(dir, "api-keys.json"), "{ not json");
  ({ env } = await launch());
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => [key.id, key.tail]),
    before.map((key) => [key.id, key.tail])
  );
  assert.ok(fs.readdirSync(dir).some((file) => file.startsWith("api-keys.json.unreadable-")));
  assert.equal(env.getFeatureKey("dictation", "openai"), OPENAI_THREE);
  assert.deepEqual(leaks(), []);
});

test("before the keys are read, the slot's setter works as it always did", () => {
  const fresh = new EnvironmentManager();
  fresh.saveAnthropicKey(ANTHROPIC_ONE);
  assert.equal(fresh.getAnthropicKey(), ANTHROPIC_ONE);
  assert.equal(fresh.getFeatureKey("writing", "anthropic"), ANTHROPIC_ONE);
  fresh.saveAnthropicKey("");
  assert.equal(fresh.getAnthropicKey(), "");
});

test("nothing in this file loaded the OS keyring", () => {
  assert.equal(
    Object.keys(require.cache).some((file) =>
      file.includes(`${path.sep}@napi-rs${path.sep}keyring`)
    ),
    false
  );
});

test.after(() => {
  fs.rmSync(tmpUserData, { recursive: true, force: true });
});
