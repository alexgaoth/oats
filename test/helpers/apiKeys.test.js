const assert = require("node:assert/strict");
const test = require("node:test");

// Named API keys (src/helpers/apiKeys.mjs): default names, the key each
// feature uses, what a key added takes over, where a feature goes when its
// key is removed, and the migration of the one key each provider had.

let keys;
test.before(async () => {
  keys = await import("../../src/helpers/apiKeys.mjs");
});

// Fake records: ids main would make, tails of fake keys. No secret anywhere.
const id = (n) => `k${String(n).padStart(16, "0")}`;
function key(n, provider, fields = {}) {
  return { id: id(n), provider, name: "", number: n, tail: `ta${n}x`.slice(-4), addedAt: n, status: null, ...fields };
}
function records(list, features = {}) {
  return keys.normalizeKeyRecords({ keys: list, features });
}

const english = (provider) => (number) => `${provider} key ${number}`;
const german = (provider) => (number) => `${provider}-Schlüssel ${number}`;

function nextName(provider, names, format = english) {
  const parts = keys.defaultNameParts(format(provider));
  return format(provider)(keys.nextDefaultNumber(names, parts));
}

test("speech needs an OpenAI key; writing takes OpenAI or Anthropic", () => {
  for (const feature of ["conversations", "dictation", "writing"]) {
    assert.equal(keys.keyServes("openai", feature), true, feature);
  }
  assert.equal(keys.keyServes("anthropic", "writing"), true);
  assert.equal(keys.keyServes("anthropic", "conversations"), false);
  assert.equal(keys.keyServes("anthropic", "dictation"), false);
  assert.equal(keys.keyServes("gemini", "writing"), false);
  assert.equal(keys.keyServes("openai", "summaries"), false);
});

test("default names count per provider: one more than the highest a default name uses", () => {
  assert.equal(nextName("OpenAI", []), "OpenAI key 1");
  assert.equal(nextName("OpenAI", ["OpenAI key 1"]), "OpenAI key 2");
  // The first Anthropic key is number 1, whatever OpenAI's keys are called.
  assert.equal(nextName("Anthropic", []), "Anthropic key 1");
  // The highest, not the count: key 1 was removed, key 2 is left.
  assert.equal(nextName("OpenAI", ["OpenAI key 2"]), "OpenAI key 3");
  assert.equal(nextName("OpenAI", ["OpenAI key 1", "OpenAI key 7", "Work"]), "OpenAI key 8");
  // A key renamed to something else no longer holds its number.
  assert.equal(nextName("OpenAI", ["Work", "Home"]), "OpenAI key 1");
  // A name the person typed that reads as a default name uses its number.
  assert.equal(nextName("OpenAI", ["  OpenAI key 4  "]), "OpenAI key 5");
  // Near misses are not default names.
  for (const name of ["OpenAI key", "OpenAI key x", "OpenAI key 2b", "openai key 9", "OpenAI key -3"]) {
    assert.equal(nextName("OpenAI", [name]), "OpenAI key 1", name);
  }
});

test("default names follow the language the interface is in", () => {
  assert.equal(nextName("OpenAI", ["OpenAI-Schlüssel 2"], german), "OpenAI-Schlüssel 3");
  // A suffix after the number is matched too.
  const suffixed = (provider) => (number) => `Clé ${number} (${provider})`;
  assert.equal(nextName("OpenAI", ["Clé 3 (OpenAI)"], suffixed), "Clé 4 (OpenAI)");
  // A format with no number in it starts at 1.
  assert.equal(keys.nextDefaultNumber(["OpenAI key 1"], keys.defaultNameParts(() => "x")), 1);
});

test("a feature uses its chosen key, else its provider's oldest usable key", () => {
  const list = [key(1, "openai"), key(2, "openai"), key(3, "anthropic")];
  // No choice: the oldest.
  assert.equal(keys.resolveFeatureKey(records(list), "dictation", "openai").id, id(1));
  // Two features, two keys of one provider.
  const chosen = records(list, { conversations: id(2), dictation: id(1), writing: id(3) });
  assert.equal(keys.resolveFeatureKey(chosen, "conversations", "openai").id, id(2));
  assert.equal(keys.resolveFeatureKey(chosen, "dictation", "openai").id, id(1));
  assert.equal(keys.resolveFeatureKey(chosen, "writing", "anthropic").id, id(3));
  // Writing asked of the other provider: that provider's own key.
  assert.equal(keys.resolveFeatureKey(chosen, "writing", "openai").id, id(1));
  // A refused oldest key is passed over when nothing is chosen.
  const refused = records([key(1, "openai", { status: "rejected" }), key(2, "openai")]);
  assert.equal(keys.resolveFeatureKey(refused, "dictation", "openai").id, id(2));
  // A refused key that was chosen stays the feature's key, so the row says so.
  const refusedChoice = records([key(1, "openai", { status: "rejected" }), key(2, "openai")], {
    dictation: id(1),
  });
  assert.equal(keys.resolveFeatureKey(refusedChoice, "dictation", "openai").id, id(1));
  // Only refused keys: the oldest, shown as refused.
  const allRefused = records([key(1, "openai", { status: "no-access" })]);
  assert.equal(keys.resolveFeatureKey(allRefused, "dictation", "openai").id, id(1));
  // Nothing that can serve.
  assert.equal(keys.resolveFeatureKey(records([key(3, "anthropic")]), "dictation", "openai"), null);
  assert.equal(keys.resolveFeatureKey(records(list), "dictation", "anthropic"), null);
  assert.equal(keys.resolveFeatureKey(records([]), "writing", "openai"), null);
});

test("a key never asked about is usable; a refused one is not", () => {
  for (const status of [null, undefined, "ok", "limited", "legacy"]) {
    assert.equal(keys.keyUsable(status), true, String(status));
  }
  for (const status of ["rejected", "no-access", "unknown"]) {
    assert.equal(keys.keyUsable(status), false, status);
  }
});

test("Writing's key comes from the writing provider", () => {
  const list = records([key(1, "openai"), key(2, "anthropic")]);
  assert.equal(keys.featureKeyProvider(list, "conversations", "anthropic"), "openai");
  assert.equal(keys.featureKeyProvider(list, "writing", "anthropic"), "anthropic");
  assert.equal(keys.featureKeyProvider(list, "writing", "openai"), "openai");
  // None chosen yet: OpenAI, as the route reads it (featureRoutes.mjs).
  assert.equal(keys.featureKeyProvider(list, "writing", null), "openai");
  // A provider whose keys have no names: no named key serves it.
  assert.equal(keys.featureKeyProvider(list, "writing", "gemini"), null);
});

test("a first OpenAI key is chosen for every feature it can serve", () => {
  const empty = records([]);
  assert.deepEqual(keys.featuresForNewKey(empty, "openai", { writingProvider: "openai" }), [
    "conversations",
    "dictation",
    "writing",
  ]);
  // With no writing provider yet, Writing is left to the provider it gets.
  assert.deepEqual(keys.featuresForNewKey(empty, "openai"), ["conversations", "dictation"]);
  // An Anthropic key never takes speech.
  assert.deepEqual(keys.featuresForNewKey(empty, "anthropic", { writingProvider: "anthropic" }), [
    "writing",
  ]);
  assert.deepEqual(
    keys.featuresForNewKey(empty, "anthropic", { forFeature: "dictation", writingProvider: null }),
    []
  );
});

test("a second key takes only what has no usable key, or what it was added for", () => {
  const one = records([key(1, "openai")], { conversations: id(1), dictation: id(1), writing: id(1) });
  assert.deepEqual(keys.featuresForNewKey(one, "openai", { writingProvider: "openai" }), []);
  assert.deepEqual(
    keys.featuresForNewKey(one, "openai", { forFeature: "writing", writingProvider: "openai" }),
    ["writing"]
  );
  // A key added for Writing takes it from the other provider.
  assert.deepEqual(
    keys.featuresForNewKey(one, "anthropic", { forFeature: "writing", writingProvider: "openai" }),
    ["writing"]
  );
  // A key added for speech does not move the writing model to its provider.
  assert.deepEqual(keys.featuresForNewKey(one, "anthropic", { writingProvider: "openai" }), []);
  // A feature whose key was refused takes a new key.
  const refused = records([key(1, "openai", { status: "rejected" })], { dictation: id(1) });
  assert.deepEqual(keys.featuresForNewKey(refused, "openai", { writingProvider: "openai" }), [
    "conversations",
    "dictation",
    "writing",
  ]);
});

test("a removed key's features move to the same provider's next usable key", () => {
  const list = records([key(1, "openai"), key(2, "openai"), key(3, "anthropic")], {
    conversations: id(1),
    dictation: id(2),
    writing: id(1),
  });
  const plan = keys.removalPlan(list, id(1), "openai");
  assert.deepEqual(plan.features, { conversations: id(2), dictation: id(2), writing: id(2) });
  assert.deepEqual(plan.moves, [
    { feature: "conversations", to: id(2) },
    { feature: "writing", to: id(2) },
  ]);
});

test("D: a removed key's feature never moves to the other provider", () => {
  const list = records([key(1, "openai"), key(3, "anthropic")], {
    conversations: id(1),
    dictation: id(1),
    writing: id(1),
  });
  const plan = keys.removalPlan(list, id(1), "openai");
  // No OpenAI key is left: every feature that used it shows the missing-key
  // state and runs on this Mac, Writing too, though an Anthropic key is there.
  assert.deepEqual(plan.features, {});
  assert.deepEqual(plan.moves, [
    { feature: "conversations", to: null },
    { feature: "dictation", to: null },
    { feature: "writing", to: null },
  ]);
  assert.equal("writingProvider" in plan, false);
  // The same from Anthropic: Writing does not go back to OpenAI.
  const back = keys.removalPlan(
    records([key(1, "openai"), key(3, "anthropic")], {
      conversations: id(1),
      dictation: id(1),
      writing: id(3),
    }),
    id(3),
    "anthropic"
  );
  assert.deepEqual(back.features, { conversations: id(1), dictation: id(1) });
  assert.deepEqual(back.moves, [{ feature: "writing", to: null }]);
});

test("a refused key is not where a removed key's features go", () => {
  const list = records(
    [key(1, "openai"), key(2, "openai", { status: "rejected" }), key(3, "anthropic", { status: "unknown" })],
    { conversations: id(1), dictation: id(1), writing: id(1) }
  );
  const plan = keys.removalPlan(list, id(1), "openai");
  assert.deepEqual(plan.features, {});
  assert.ok(plan.moves.every((move) => move.to === null));
});

test("removing a key another feature does not use leaves that feature alone", () => {
  const list = records([key(1, "openai"), key(2, "openai")], {
    conversations: id(1),
    dictation: id(2),
    writing: id(1),
  });
  const plan = keys.removalPlan(list, id(2), "openai");
  assert.deepEqual(plan.features, { conversations: id(1), dictation: id(1), writing: id(1) });
  assert.deepEqual(plan.moves, [{ feature: "dictation", to: id(1) }]);
  // An unknown key changes nothing.
  assert.deepEqual(keys.removalPlan(list, id(9), "openai").features, list.features);
});

test("migration: each provider's one key is chosen for every feature that uses it", () => {
  const openai = key(1, "openai");
  const anthropic = key(2, "anthropic");
  assert.deepEqual(keys.slotKeyChoices([openai]), {
    conversations: id(1),
    dictation: id(1),
    writing: id(1),
  });
  assert.deepEqual(keys.slotKeyChoices([anthropic]), { writing: id(2) });
  // Both: Writing follows the writing provider, which only the window knows.
  assert.deepEqual(keys.slotKeyChoices([openai, anthropic]), {
    conversations: id(1),
    dictation: id(1),
  });
  for (const provider of ["openai", "anthropic"]) {
    const both = records([openai, anthropic], keys.slotKeyChoices([openai, anthropic]));
    const writer = keys.resolveFeatureKey(both, "writing", provider);
    assert.equal(writer.provider, provider);
  }
  // A choice already made is kept.
  assert.deepEqual(keys.slotKeyChoices([openai], { dictation: id(5) }), {
    conversations: id(1),
    dictation: id(5),
    writing: id(1),
  });
});

test("records are trusted only as far as they are valid, and carry no secret", () => {
  const raw = {
    keys: [
      { ...key(2, "openai"), secret: "sk-test-not-a-real-key-0000", extra: 1 },
      key(1, "anthropic", { name: "  Work\n account\u0000 " }),
      { ...key(3, "openai"), id: "../../etc/passwd" },
      { ...key(4, "gemini") },
      key(2, "openai"),
      { ...key(5, "openai"), number: -2, addedAt: "soon", status: "fine", tail: "a/b?cdef" },
    ],
    features: { conversations: id(1), dictation: id(2), writing: id(1), summaries: id(2) },
    defaults: { openai: id(1), anthropic: id(1), gemini: id(2) },
  };
  const clean = keys.normalizeKeyRecords(raw);
  assert.deepEqual(
    clean.keys.map((record) => record.id),
    [id(5), id(1), id(2)]
  );
  for (const record of clean.keys) {
    assert.deepEqual(Object.keys(record).sort(), [
      "addedAt",
      "id",
      "name",
      "number",
      "provider",
      "rev",
      "status",
      "tail",
    ]);
  }
  assert.equal(JSON.stringify(clean).includes("not-a-real-key"), false);
  assert.equal(clean.keys[1].name, "Work account");
  assert.deepEqual(clean.keys[0], {
    id: id(5),
    provider: "openai",
    name: "",
    number: 1,
    tail: "cdef",
    addedAt: 0,
    status: null,
    rev: 1,
  });
  // An Anthropic key cannot be Conversations' key; an unknown feature is dropped.
  assert.deepEqual(clean.features, { dictation: id(2), writing: id(1) });
  // A default names a key of its own provider.
  assert.deepEqual(clean.defaults, { anthropic: id(1) });
  const empty = { keys: [], features: {}, defaults: {} };
  assert.deepEqual(keys.normalizeKeyRecords(null), empty);
  assert.deepEqual(keys.normalizeKeyRecords("garbage"), empty);
  assert.deepEqual(Object.keys(keys.publicKeyRecord({ ...key(1, "openai"), secret: "x" })).sort(), [
    "addedAt",
    "id",
    "name",
    "number",
    "provider",
    "rev",
    "status",
    "tail",
  ]);
  // A revision is a whole number from 1.
  const revs = keys.normalizeKeyRecords({
    keys: [key(1, "openai", { rev: 3 }), key(2, "openai", { rev: 0 }), key(3, "openai", { rev: "x" })],
  });
  assert.deepEqual(
    revs.keys.map((record) => record.rev),
    [3, 1, 1]
  );
});

test("a key's name is one line, at most 64 characters", () => {
  assert.equal(keys.cleanKeyName("  Personal  "), "Personal");
  assert.equal(keys.cleanKeyName("a\tb\nc"), "a b c");
  assert.equal(keys.cleanKeyName(null), "");
  assert.equal(keys.cleanKeyName("x".repeat(80)).length, keys.KEY_NAME_MAX);
  // Characters, not UTF-16 units: an emoji is not cut in half.
  assert.equal(keys.cleanKeyName("🔑".repeat(70)), "🔑".repeat(64));
});

test("only ids main makes pass", () => {
  assert.equal(keys.isKeyId(id(1)), true);
  assert.equal(keys.isKeyId("k3f9a0c1e2b4d5f60"), true);
  for (const bad of ["", "k123", "K0000000000000001", "k000000000000000g", "../k0000000000000001", 7]) {
    assert.equal(keys.isKeyId(bad), false, String(bad));
  }
});

test("the key store keeps nothing in localStorage and logs no secret", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8");
  // The records come from main and stay in memory; the secrets stay in main.
  const storage = /\b(?:local|session)Storage\s*(?:\.\s*(?:setItem|getItem|removeItem|clear|key)\b|\[)/;
  for (const file of ["src/stores/apiKeys.ts", "src/helpers/apiKeys.mjs"]) {
    assert.doesNotMatch(read(file), storage, file);
  }
  const store = read("src/stores/apiKeys.ts");
  // The secret goes to the provider's check and to main, and no log line has it.
  assert.equal((store.match(/checkKey\(detected, secret\)/g) ?? []).length, 1);
  for (const call of store.match(/logger\.\w+\([^;]*;/g) ?? []) {
    assert.doesNotMatch(call, /secret|input\./, call);
  }
  assert.doesNotMatch(store, /console\./);
  // The settings store takes the records normalized, which drops any secret.
  const settings = read("src/stores/settingsStore.ts");
  assert.match(settings, /keyRecords: normalizeKeyRecords\(savedKeyList\)/);
  assert.match(settings, /const records = normalizeKeyRecords\(raw\);/);
  assert.doesNotMatch(settings, /localStorage\.setItem\([^)]*keyRecords/);
});

test("A: a field for one key changes only the key it shows, and removes none", () => {
  const list = records([key(1, "openai"), key(2, "openai", { name: "Work" }), key(3, "anthropic")], {
    conversations: id(2),
    writing: id(3),
  });
  // A chooser of a feature shows the key that feature uses with the provider.
  assert.equal(keys.chooserKey(list, "openai", "conversations").id, id(2));
  assert.equal(keys.chooserKey(list, "anthropic", "writing").id, id(3));
  assert.equal(keys.chooserKey(list, "openai", "writing").id, id(1));
  // Any other shows the default key.
  assert.equal(keys.chooserKey(list, "openai").id, id(1));
  assert.equal(keys.chooserKey(records([key(3, "anthropic")]), "openai"), null);
  // What it does with the text: replace that key, add one when it shows none,
  // and nothing for empty text.
  assert.deepEqual(keys.singleKeyEdit(list.keys[1], "sk-proj-fake-0000"), {
    action: "replace",
    id: id(2),
  });
  assert.deepEqual(keys.singleKeyEdit(null, "sk-proj-fake-0000"), { action: "add" });
  for (const text of ["", "   ", null, undefined]) {
    assert.deepEqual(keys.singleKeyEdit(list.keys[1], text), { action: "none" });
  }
});

test("B: a provider's default key is the one its slot holds, else its oldest", () => {
  const base = [key(1, "openai"), key(2, "openai"), key(3, "anthropic")];
  assert.equal(keys.defaultKeyOf(records(base), "openai").id, id(1));
  assert.equal(keys.defaultKeyOf(records(base, {}), "anthropic").id, id(3));
  const named = keys.normalizeKeyRecords({ keys: base, defaults: { openai: id(2) } });
  assert.equal(keys.defaultKeyOf(named, "openai").id, id(2));
  // Empty on purpose (no key could be read): the oldest once one can.
  const empty = keys.normalizeKeyRecords({ keys: base, defaults: { openai: null } });
  assert.equal(empty.defaults.openai, null);
  assert.equal(keys.defaultKeyOf(empty, "openai").id, id(1));
  // The features that use a key, by provider: what moves to a key that replaces it.
  const used = records(base, { conversations: id(2) });
  assert.deepEqual(keys.featuresUsingKey(used, id(1), "openai"), ["dictation", "writing"]);
  assert.deepEqual(keys.featuresUsingKey(used, id(2), "openai"), ["conversations"]);
  assert.deepEqual(keys.featuresUsingKey(used, id(3), "anthropic"), ["writing"]);
});

test("D and J: the renderer neither moves a feature across providers nor takes another key", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8");
  const store = read("src/stores/apiKeys.ts");
  const remove = store.slice(
    store.indexOf("export async function removeApiKey"),
    store.indexOf("export function chooseFeatureKey")
  );
  assert.doesNotMatch(remove, /setWritingProvider/);
  assert.match(remove, /throw new Error\(i18n\.t\("oats\.keys\.notRemoved"\)\)/);
  // Before the records arrive, a feature's key is asked of main, by feature;
  // after, it is the records' key or none, never the provider's default slot.
  const reasoning = read("src/services/ReasoningService.ts");
  const featureKey = reasoning.slice(
    reasoning.indexOf("private async getFeatureKey"),
    reasoning.indexOf("private async callChatCompletionsApi")
  );
  assert.match(featureKey, /records !== NO_KEYS/);
  assert.match(featureKey, /getFeatureApiKey\?\.\(feature, provider\)/);
  assert.match(featureKey, /`key:\$\{key\.id\}:\$\{key\.rev\}`/);
  assert.doesNotMatch(featureKey, /getOpenAIKey|getAnthropicKey|openaiApiKey/);
  const audio = read("src/helpers/audioManager.js");
  const dictation = audio.slice(
    audio.indexOf("  async getDictationKey(s) {"),
    audio.indexOf("  async processWithReasoningModel(")
  );
  assert.match(dictation, /s\.keyRecords === NO_KEYS/);
  assert.match(dictation, /getFeatureApiKey\?\.\("dictation", "openai"\)/);
  assert.match(dictation, /cached\.rev === key\.rev/);
  assert.doesNotMatch(dictation, /openaiApiKey|getOpenAIKey/);
});
