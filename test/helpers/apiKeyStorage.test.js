const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const Module = require("module");

// Named keys in the main process (environment.js): one encrypted file per
// key, a list that holds no secret, each provider's slot kept on its default
// key, the migration of the one key per provider, the key each feature's call
// uses, and what happens when the slot or the files change outside these
// records. The OS keyring is never loaded, and electron's safeStorage is a
// stand-in that scrambles reversibly, so secretCrypto takes its safeStorage
// path. Every secret here is a fake. Each test has a profile of its own.

const scramble = (text) =>
  Buffer.from(`fake:${Buffer.from(text, "utf8").toString("base64")}`).reverse();
const unscramble = (buffer) => {
  const text = Buffer.from(buffer).reverse().toString("utf8");
  if (!text.startsWith("fake:")) throw new Error("not a fake blob");
  return Buffer.from(text.slice(5), "base64").toString("utf8");
};
const profile = { userData: null };
const fakeElectron = {
  app: { getPath: () => profile.userData, isPackaged: true },
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

const EnvironmentManager = require("../../src/helpers/environment");

const ONE = "sk-proj-fakeOpenAiKeyOne000AAAA";
const TWO = "sk-proj-fakeOpenAiKeyTwo000BBBB";
const THREE = "sk-proj-fakeOpenAiKeyThree00CCCC";
const NEW = "sk-proj-fakeOpenAiKeyNewer00NNNN";
const ANT = "sk-ant-fakeAnthropicKeyOne0DDDD";
const SECRETS = [ONE, TWO, THREE, NEW, ANT];
const SLOTS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];

const dir = () => path.join(profile.userData, "secure-keys");
const file = (name) => path.join(dir(), name);
const readList = () => JSON.parse(fs.readFileSync(file("api-keys.json"), "utf8"));
const keyFile = (id) => file(`api-key-${id}.enc`);
const slotFile = (name) => {
  try {
    return unscramble(fs.readFileSync(file(`${name}.enc`)));
  } catch (error) {
    return `<${error.code ?? "unreadable"}>`;
  }
};
/** Whether any file the app wrote, or any line it logged, holds a secret in clear. */
function leaks() {
  const found = [];
  const names = profile.userData && fs.existsSync(dir()) ? fs.readdirSync(dir()) : [];
  for (const name of names) {
    if (fs.statSync(file(name)).isDirectory()) continue;
    const text = fs.readFileSync(file(name)).toString("utf8");
    for (const secret of SECRETS) if (text.includes(secret)) found.push(name);
  }
  for (const line of logged) {
    for (const secret of SECRETS) if (line.includes(secret)) found.push("a log line");
  }
  return found;
}
async function waitFor(check) {
  const until = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A new profile, with the slots an earlier version left (encrypted, as it saved them). */
function freshProfile(slots = {}) {
  profile.userData = fs.mkdtempSync(path.join(os.tmpdir(), "oats-keys-test-"));
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(file(".migrated"), "");
  for (const [name, secret] of Object.entries(slots)) {
    fs.writeFileSync(file(`${name}.enc`), scramble(secret));
  }
}
/** A launch of the app: a new process starts with no slot in its environment. */
async function launch() {
  for (const name of SLOTS) delete process.env[name];
  const env = new EnvironmentManager();
  const changes = [];
  env.onApiKeysChanged = (list) => changes.push(list);
  await env.init();
  return { env, changes };
}

test.afterEach(() => {
  assert.deepEqual(leaks(), []);
  if (profile.userData) fs.rmSync(profile.userData, { recursive: true, force: true });
  profile.userData = null;
});

test("an install from before names: its one key per provider becomes key 1, for every feature", async () => {
  freshProfile({ OPENAI_API_KEY: ONE, ANTHROPIC_API_KEY: ANT });
  const { env } = await launch();
  const list = env.listApiKeys();
  assert.deepEqual(
    list.keys.map((key) => [key.provider, key.name, key.number, key.tail, key.status, key.rev]),
    [
      ["openai", "", 1, "AAAA", null, 1],
      ["anthropic", "", 1, "DDDD", null, 1],
    ]
  );
  const [openai, anthropic] = list.keys;
  assert.deepEqual(list.features, { conversations: openai.id, dictation: openai.id });
  assert.deepEqual(list.defaults, { openai: openai.id, anthropic: anthropic.id });
  // Each feature's call uses the key it used before: the same secret.
  assert.equal(env.getFeatureKey("conversations", "openai"), ONE);
  assert.equal(env.getFeatureKey("dictation", "openai"), ONE);
  assert.equal(env.getFeatureKey("writing", "openai"), ONE);
  assert.equal(env.getFeatureKey("writing", "anthropic"), ANT);
  assert.equal(env.getOpenAIKey(), ONE);
  assert.equal(env.getAnthropicKey(), ANT);
  assert.ok(fs.existsSync(keyFile(openai.id)) && fs.existsSync(keyFile(anthropic.id)));
  assert.equal(readList().version, 1);
});

test("a second launch reads the same keys back, and writes nothing new", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  await launch();
  const before = readList();
  const stamp = fs.statSync(file("api-keys.json")).mtimeMs;
  const { env, changes } = await launch();
  assert.deepEqual(env.listApiKeys(), {
    keys: before.keys,
    features: before.features,
    defaults: before.defaults,
  });
  assert.equal(fs.statSync(file("api-keys.json")).mtimeMs, stamp);
  assert.equal(changes.length, 0);
});

test("keys are added with names, deduplicated, and each feature uses its own", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  const { env, changes } = await launch();
  const work = await env.addApiKey({
    provider: "openai",
    secret: TWO,
    name: "Work",
    number: 2,
    status: "ok",
    assign: ["conversations"],
  });
  assert.equal(work.ok, true);
  const record = work.list.keys.find((key) => key.id === work.id);
  assert.deepEqual(
    [record.name, record.tail, record.status, record.rev],
    ["Work", "BBBB", "ok", 1]
  );
  assert.equal(env.getFeatureKey("conversations", "openai"), TWO);
  assert.equal(env.getFeatureKey("dictation", "openai"), ONE);
  // The slot keeps the default key.
  assert.equal(env.getOpenAIKey(), ONE);
  assert.equal(changes.length, 1);
  for (const secret of SECRETS) assert.equal(JSON.stringify(changes).includes(secret), false);
  // The same secret twice is one key.
  const again = await env.addApiKey({ provider: "openai", secret: TWO, assign: [] });
  assert.equal(again.id, work.id);
  assert.equal(env.listApiKeys().keys.length, 2);
  // What cannot be a key is refused.
  for (const secret of ["", "short", "sk-has a space-0000000", 42]) {
    assert.equal((await env.addApiKey({ provider: "openai", secret })).ok, false);
  }
  assert.equal((await env.addApiKey({ provider: "gemini", secret: THREE })).ok, false);
  // An Anthropic key is never a speech feature's.
  const ant = await env.addApiKey({ provider: "anthropic", secret: ANT, assign: ["dictation"] });
  assert.notEqual(ant.list.features.dictation, ant.id);
  assert.equal(env.getFeatureKey("dictation", "openai"), ONE);
  // A rename keeps the key; an unknown id changes nothing and builds no path.
  const renamed = await env.renameApiKey(work.id, "  Client\nA ", 2);
  assert.equal(renamed.ok, true);
  assert.equal(renamed.list.keys.find((key) => key.id === work.id).name, "Client A");
  assert.equal((await env.renameApiKey("../../evil", "x")).ok, false);
  assert.equal((await env.removeApiKey("../../evil", {})).ok, false);
  assert.equal(env.getApiKeySecret("../../evil"), "");
});

test("J: main answers the key a feature uses, with its revision, and never another key", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  const { env } = await launch();
  const work = await env.addApiKey({ provider: "openai", secret: TWO, assign: ["conversations"] });
  assert.deepEqual(env.getFeatureKeyRecord("conversations", "openai"), {
    id: work.id,
    rev: 1,
    secret: TWO,
  });
  // Anthropic has no key: no answer, and not the OpenAI slot either.
  assert.equal(env.getFeatureKeyRecord("writing", "anthropic"), null);
  assert.equal(env.getFeatureKeyRecord("summaries", "openai"), null);
  // Before the keys are read, the slot, as before.
  const early = new EnvironmentManager();
  assert.deepEqual(early.getFeatureKeyRecord("dictation", "openai"), {
    id: null,
    rev: 0,
    secret: ONE,
  });
});

test("I: a replace keeps the id and the features, and moves the revision on", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  const { env } = await launch();
  const [one] = env.listApiKeys().keys;
  const replaced = await env.replaceApiKey(one.id, { secret: THREE, status: "ok" });
  assert.equal(replaced.ok, true);
  const after = replaced.list.keys.find((key) => key.id === one.id);
  assert.deepEqual([after.tail, after.rev, after.status], ["CCCC", 2, "ok"]);
  assert.deepEqual(env.getFeatureKeyRecord("dictation", "openai"), {
    id: one.id,
    rev: 2,
    secret: THREE,
  });
  assert.equal(env.getOpenAIKey(), THREE);
  assert.equal(slotFile("OPENAI_API_KEY"), THREE);
});

test("removing the default key deletes its secret and moves the slot to the next key", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  const { env } = await launch();
  const two = await env.addApiKey({ provider: "openai", secret: TWO, assign: [] });
  const [one] = env.listApiKeys().keys;
  const result = await env.removeApiKey(one.id, { dictation: two.id });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.list.keys.map((key) => key.tail),
    ["BBBB"]
  );
  assert.equal(result.list.features.dictation, two.id);
  assert.equal(result.list.defaults.openai, two.id);
  assert.equal(fs.existsSync(keyFile(one.id)), false);
  assert.equal(env.getOpenAIKey(), TWO);
  assert.equal(slotFile("OPENAI_API_KEY"), TWO);
  assert.equal(env.getApiKeySecret(one.id), "");
});

test("A: the single slot's setter never overwrites or removes a named key", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  const { env } = await launch();
  const work = await env.addApiKey({
    provider: "openai",
    secret: TWO,
    name: "Work",
    assign: ["conversations"],
  });
  const [one] = env.listApiKeys().keys;
  // The person clears the field: nothing is removed.
  assert.deepEqual(await env.saveOpenAIKey(""), { success: false });
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => key.id),
    [one.id, work.id]
  );
  assert.equal(env.getOpenAIKey(), ONE);
  // Then pastes a key: it is added, and is the default key; Work is untouched.
  assert.deepEqual(await env.saveOpenAIKey(NEW), { success: true });
  assert.equal(env.listApiKeys().keys.length, 3);
  assert.equal(env.getApiKeySecret(work.id), TWO);
  assert.equal(env.getApiKeySecret(one.id), ONE);
  assert.equal(env.getOpenAIKey(), NEW);
  // The features that used the old default key use the new one; Work's keeps Work.
  assert.equal(env.getFeatureKey("conversations", "openai"), TWO);
  assert.equal(env.getFeatureKey("dictation", "openai"), NEW);
  // Text that cannot be a key changes nothing.
  assert.deepEqual(await env.saveOpenAIKey("not a key"), { success: false });
  assert.equal(env.listApiKeys().keys.length, 3);
});

test("B: a key an earlier version put in the slot is kept, as the default, with the features of the key before it", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env } = await launch();
  const work = await env.addApiKey({ provider: "openai", secret: TWO, assign: ["conversations"] });
  const [one] = env.listApiKeys().keys;
  // An earlier version saves another key: it writes the slot's file only.
  fs.writeFileSync(file("OPENAI_API_KEY.enc"), scramble(NEW));
  ({ env } = await launch());
  const list = env.listApiKeys();
  assert.equal(list.keys.length, 3);
  const adopted = list.keys.find((key) => key.tail === "NNNN");
  assert.equal(list.defaults.openai, adopted.id);
  assert.equal(env.getOpenAIKey(), NEW);
  assert.equal(slotFile("OPENAI_API_KEY"), NEW);
  // Dictation and Writing used key 1, the slot's key: they use the new key now.
  assert.equal(env.getFeatureKey("dictation", "openai"), NEW);
  assert.equal(env.getFeatureKey("writing", "openai"), NEW);
  assert.equal(env.getFeatureKey("conversations", "openai"), TWO);
  // Nothing is lost.
  assert.equal(env.getApiKeySecret(one.id), ONE);
  assert.equal(env.getApiKeySecret(work.id), TWO);
});

test("B: a key an earlier version removed from the slot stays removed", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env } = await launch();
  const work = await env.addApiKey({ provider: "openai", secret: TWO, assign: ["conversations"] });
  const [one] = env.listApiKeys().keys;
  fs.unlinkSync(file("OPENAI_API_KEY.enc"));
  ({ env } = await launch());
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => key.id),
    [work.id]
  );
  assert.equal(fs.existsSync(keyFile(one.id)), false);
  // Work is the default now, and fills the slot.
  assert.equal(env.getOpenAIKey(), TWO);
  ({ env } = await launch());
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => key.id),
    [work.id]
  );
});

test("B: a key saved while the records could not be read is kept at the next launch", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  await launch();
  // A list this version cannot read, which cannot be set aside this launch:
  // the named keys are off, and the slots serve, as before.
  fs.writeFileSync(file("api-keys.json"), "{ not json");
  fs.chmodSync(dir(), 0o500);
  let off;
  try {
    ({ env: off } = await launch());
  } finally {
    fs.chmodSync(dir(), 0o700);
  }
  assert.deepEqual(off.listApiKeys().keys, []);
  assert.equal(off.getFeatureKey("dictation", "openai"), ONE);
  // A key saved then goes to the slot only, as before.
  off.saveOpenAIKey(NEW);
  await waitFor(() => slotFile("OPENAI_API_KEY") === NEW);
  const { env } = await launch();
  assert.equal(env.getOpenAIKey(), NEW);
  const tails = env.listApiKeys().keys.map((key) => key.tail);
  assert.ok(tails.includes("NNNN") && tails.includes("AAAA"));
  assert.equal(env.getFeatureKey("dictation", "openai"), NEW);
});

test("C: removing the last key that can be read empties the slot, even beside one that cannot", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env } = await launch();
  const two = await env.addApiKey({ provider: "openai", secret: TWO, assign: [] });
  const good = fs.readFileSync(keyFile(two.id));
  fs.writeFileSync(keyFile(two.id), Buffer.from("garbage-not-a-blob"));
  ({ env } = await launch());
  const [one] = env.listApiKeys().keys;
  assert.equal(env.listApiKeys().keys.length, 1);
  const result = await env.removeApiKey(one.id, {});
  assert.equal(result.ok, true);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  assert.equal(env.getOpenAIKey(), "");
  assert.equal(env.getFeatureKey("conversations", "openai"), "");
  assert.equal(fs.existsSync(file("OPENAI_API_KEY.enc")), false);
  assert.equal(fs.existsSync(keyFile(one.id)), false);
  // The unreadable key stays on disk; once it can be read, it is the key.
  assert.ok(fs.existsSync(keyFile(two.id)));
  fs.writeFileSync(keyFile(two.id), good);
  ({ env } = await launch());
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => key.id),
    [two.id]
  );
  assert.equal(env.getOpenAIKey(), TWO);
  assert.equal(env.getFeatureKey("conversations", "openai"), TWO);
});

test("E: a list of a shape this version does not write is kept aside, and the keys are kept", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env } = await launch();
  await env.addApiKey({ provider: "openai", secret: TWO, name: "Work", assign: ["conversations"] });
  await env.addApiKey({ provider: "anthropic", secret: ANT, assign: ["writing"] });
  const list = readList();
  const later = { version: 2, entries: list.keys, features: list.features };
  fs.writeFileSync(file("api-keys.json"), JSON.stringify(later));
  ({ env } = await launch());
  assert.equal(fs.readdirSync(dir()).filter((name) => /^api-key-.*\.enc$/.test(name)).length, 3);
  assert.deepEqual(
    env.listApiKeys()
      .keys.map((key) => key.tail)
      .sort(),
    ["AAAA", "BBBB", "DDDD"]
  );
  const aside = fs.readdirSync(dir()).find((name) => name.startsWith("api-keys.json.unreadable-"));
  assert.deepEqual(JSON.parse(fs.readFileSync(file(aside), "utf8")), later);
  assert.equal(env.getOpenAIKey(), ONE);
});

test("F: a removal whose slot cannot be written is undone and reported", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env, changes } = await launch();
  await env.addApiKey({ provider: "openai", secret: TWO, assign: [] });
  const [one] = env.listApiKeys().keys;
  const seen = changes.length;
  fs.mkdirSync(file("OPENAI_API_KEY.enc.tmp"));
  const result = await env.removeApiKey(one.id, {});
  assert.equal(result.ok, false);
  assert.ok(result.list.keys.some((key) => key.id === one.id));
  assert.ok(env.listApiKeys().keys.some((key) => key.id === one.id));
  assert.equal(env.getOpenAIKey(), ONE);
  assert.ok(fs.existsSync(keyFile(one.id)));
  assert.equal(changes.length, seen);
  fs.rmdirSync(file("OPENAI_API_KEY.enc.tmp"));
  ({ env } = await launch());
  assert.ok(env.listApiKeys().keys.some((key) => key.id === one.id));
  assert.equal(env.getOpenAIKey(), ONE);
});

test("G: what an unfinished write left is cleaned up, at launch and on removal", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env } = await launch();
  const two = await env.addApiKey({ provider: "openai", secret: TWO, assign: [] });
  const [one] = env.listApiKeys().keys;
  for (const leftover of [
    `api-key-${one.id}.enc.tmp`,
    `api-key-${two.id}.plain.tmp`,
    "OPENAI_API_KEY.enc.tmp",
    "api-keys.json.tmp",
  ]) {
    fs.writeFileSync(file(leftover), "x");
  }
  // An older plain copy beside the encrypted one.
  fs.writeFileSync(file(`api-key-${one.id}.plain`), ONE);
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(file(`api-key-${one.id}.plain`), past, past);
  ({ env } = await launch());
  assert.deepEqual(
    fs.readdirSync(dir()).filter((name) => /\.tmp$|\.plain$/.test(name)),
    []
  );
  assert.equal(env.getApiKeySecret(one.id), ONE);
  fs.writeFileSync(file(`api-key-${two.id}.enc.tmp`), "x");
  assert.equal((await env.removeApiKey(two.id, {})).ok, true);
  assert.deepEqual(
    fs.readdirSync(dir()).filter((name) => name.includes(two.id)),
    []
  );
});

test("before the keys are read, the slot's setter works as it always did", () => {
  freshProfile();
  const fresh = new EnvironmentManager();
  fresh.saveAnthropicKey(ANT);
  assert.equal(fresh.getAnthropicKey(), ANT);
  assert.equal(fresh.getFeatureKey("writing", "anthropic"), ANT);
  fresh.saveAnthropicKey("");
  assert.equal(fresh.getAnthropicKey(), "");
});

test("nothing in this file loaded the OS keyring", () => {
  assert.equal(
    Object.keys(require.cache).some((name) =>
      name.includes(`${path.sep}@napi-rs${path.sep}keyring`)
    ),
    false
  );
});

test("I: the same secret put back in a key's place changes nothing", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  const { env } = await launch();
  const [one] = env.listApiKeys().keys;
  await env.setApiKeyStatus(one.id, "ok");
  const same = await env.replaceApiKey(one.id, { secret: ONE, status: null });
  assert.equal(same.ok, true);
  const after = same.list.keys.find((key) => key.id === one.id);
  assert.deepEqual([after.rev, after.status], [1, "ok"]);
});

test("K: a change that is not saved leaves alone the slot of a provider none of whose keys can be read", async () => {
  freshProfile({ OPENAI_API_KEY: ONE, ANTHROPIC_API_KEY: ANT });
  let { env } = await launch();
  const anthropic = env.listApiKeys().keys.find((key) => key.provider === "anthropic");
  const files = [file("ANTHROPIC_API_KEY.enc"), keyFile(anthropic.id)];
  const good = files.map((name) => fs.readFileSync(name));
  // This launch cannot decrypt Anthropic's files, as when the keychain refuses.
  const garbage = Buffer.from("garbage-not-a-blob");
  for (const name of files) fs.writeFileSync(name, garbage);
  ({ env } = await launch());
  assert.equal(
    env.listApiKeys().keys.some((key) => key.provider === "anthropic"),
    false
  );
  const [one] = env.listApiKeys().keys;
  fs.mkdirSync(file("api-keys.json.tmp"));
  const result = await env.renameApiKey(one.id, "Personal");
  assert.deepEqual([result.ok, result.reason], [false, "not-saved"]);
  // Neither written nor emptied: the bytes this launch could not read are still there.
  assert.deepEqual(
    files.map((name) => fs.readFileSync(name)),
    [garbage, garbage]
  );
  fs.rmdirSync(file("api-keys.json.tmp"));
  // The keychain works again.
  files.forEach((name, index) => fs.writeFileSync(name, good[index]));
  ({ env } = await launch());
  assert.ok(env.listApiKeys().keys.some((key) => key.id === anthropic.id));
  assert.equal(env.getAnthropicKey(), ANT);
  assert.equal(env.getFeatureKey("writing", "anthropic"), ANT);
});

test("K: a change that is not saved puts each slot it wrote back as it was", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env, changes } = await launch();
  const work = await env.addApiKey({
    provider: "openai",
    secret: TWO,
    name: "Work",
    assign: ["conversations"],
  });
  const [one] = env.listApiKeys().keys;
  const slot = fs.readFileSync(file("OPENAI_API_KEY.enc"));
  const list = readList();
  const seen = changes.length;
  // The slot is written (to Work, the key after it), then the list cannot be.
  fs.mkdirSync(file("api-keys.json.tmp"));
  const result = await env.removeApiKey(one.id, {});
  assert.deepEqual([result.ok, result.reason], [false, "not-saved"]);
  assert.deepEqual(fs.readFileSync(file("OPENAI_API_KEY.enc")), slot);
  assert.equal(env.getOpenAIKey(), ONE);
  assert.ok(fs.existsSync(keyFile(one.id)));
  assert.deepEqual(readList(), list);
  assert.equal(changes.length, seen);
  fs.rmdirSync(file("api-keys.json.tmp"));
  ({ env } = await launch());
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => key.id),
    [one.id, work.id]
  );
  assert.equal(env.getOpenAIKey(), ONE);
  assert.equal(env.listApiKeys().features.conversations, work.id);
});

test("L: a replace that is not saved leaves the old secret in its file, with its features", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env } = await launch();
  const work = await env.addApiKey({
    provider: "openai",
    secret: TWO,
    name: "Work",
    status: "ok",
    assign: ["conversations"],
  });
  const [one] = env.listApiKeys().keys;
  await env.renameApiKey(one.id, "Personal");
  const saved = fs.readFileSync(keyFile(one.id));
  const { features } = env.listApiKeys();
  // The slot cannot be written; then the slot is written and the list cannot be.
  for (const blocked of ["OPENAI_API_KEY.enc.tmp", "api-keys.json.tmp"]) {
    fs.mkdirSync(file(blocked));
    const result = await env.replaceApiKey(one.id, { secret: NEW, status: "ok" });
    fs.rmdirSync(file(blocked));
    assert.deepEqual([result.ok, result.reason], [false, "not-saved"]);
    assert.equal(result.list.keys.find((key) => key.id === one.id).rev, 1);
    assert.equal(env.getApiKeySecret(one.id), ONE);
    assert.deepEqual(fs.readFileSync(keyFile(one.id)), saved);
    assert.equal(slotFile("OPENAI_API_KEY"), ONE);
    assert.deepEqual(
      fs.readdirSync(dir()).filter((name) => name.includes(".rev")),
      []
    );
  }
  ({ env } = await launch());
  const list = env.listApiKeys();
  assert.deepEqual(
    list.keys.map((key) => [key.id, key.name, key.tail, key.rev]),
    [
      [one.id, "Personal", "AAAA", 1],
      [work.id, "Work", "BBBB", 1],
    ]
  );
  assert.deepEqual(list.features, features);
  assert.equal(list.defaults.openai, one.id);
  assert.equal(env.getOpenAIKey(), ONE);
});

test("L: what a replace left when the app stopped is finished or undone at the next launch", async () => {
  freshProfile({ OPENAI_API_KEY: ONE });
  let { env } = await launch();
  const work = await env.addApiKey({
    provider: "openai",
    secret: TWO,
    name: "Work",
    assign: ["conversations"],
  });
  const [one] = env.listApiKeys().keys;
  const { features } = env.listApiKeys();
  const staged = (id, rev) => file(`api-key-${id}.rev${rev}.enc`);

  // Stopped after the slot, before the list: the replace was not saved.
  fs.writeFileSync(staged(one.id, 2), scramble(NEW));
  fs.writeFileSync(file("OPENAI_API_KEY.enc"), scramble(NEW));
  ({ env } = await launch());
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => [key.id, key.tail, key.rev]),
    [
      [one.id, "AAAA", 1],
      [work.id, "BBBB", 1],
    ]
  );
  assert.deepEqual(env.listApiKeys().features, features);
  assert.equal(env.getOpenAIKey(), ONE);
  assert.equal(slotFile("OPENAI_API_KEY"), ONE);
  assert.equal(fs.existsSync(staged(one.id, 2)), false);

  // Stopped after the list, before the move: the replace was saved.
  assert.equal((await env.replaceApiKey(one.id, { secret: NEW })).ok, true);
  fs.renameSync(keyFile(one.id), staged(one.id, 2));
  fs.writeFileSync(keyFile(one.id), scramble(ONE));
  ({ env } = await launch());
  assert.equal(env.getApiKeySecret(one.id), NEW);
  assert.deepEqual(
    env.listApiKeys().keys.map((key) => [key.id, key.tail, key.rev]),
    [
      [one.id, "NNNN", 2],
      [work.id, "BBBB", 1],
    ]
  );
  assert.equal(unscramble(fs.readFileSync(keyFile(one.id))), NEW);
  assert.equal(fs.existsSync(staged(one.id, 2)), false);
  assert.equal(env.getOpenAIKey(), NEW);

  // Stopped before the slot: deleted. One this launch cannot read waits for one that can.
  fs.writeFileSync(staged(work.id, 2), scramble(THREE));
  fs.writeFileSync(staged(work.id, 3), Buffer.from("garbage-not-a-blob"));
  ({ env } = await launch());
  assert.equal(fs.existsSync(staged(work.id, 2)), false);
  assert.ok(fs.existsSync(staged(work.id, 3)));
  assert.equal(env.getApiKeySecret(work.id), TWO);
  // Removing the key deletes every file it has.
  assert.equal((await env.removeApiKey(work.id, {})).ok, true);
  assert.deepEqual(
    fs.readdirSync(dir()).filter((name) => name.includes(work.id)),
    []
  );
});
