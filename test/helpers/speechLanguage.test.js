const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// English is the default speech language (Alex, 2026-10-26). With "auto", the
// multilingual models heard far voices as other languages in a replay of eight
// AMI meetings (alexgaoth/oats#122). These tests hold four things:
//
//   1. The default is English everywhere the setting is read: the renderer's
//      store, the main process's copy in `.env`, and the reasoning prompt.
//   2. A stored "auto" moves to English once, and a choice made after that stays.
//   3. The renderer and the main process agree on what each choice means, so the
//      launch pre-warm loads the model the first request asks for.
//   4. The setup screen and Settings write the same setting, and "auto" is still
//      a choice.
//
// The main-process parts run for real against a stubbed Electron. The renderer
// parts are the pure helper plus source pins, because the store pulls in browser
// globals (see meetingTranscriptionDefaults.test.js).

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "oats-speech-language-"));
const noop = () => {};
require.cache[require.resolve("electron")] = {
  exports: {
    app: {
      on: noop,
      getPath: () => userData,
      getName: () => "Oats",
      isPackaged: false,
      isReady: () => false,
    },
    // Read by secretCrypto; absent means no encryption, which nothing here needs.
    safeStorage: undefined,
  },
};

const EnvironmentManager = require("../../src/helpers/environment.js");
const WhisperManager = require("../../src/helpers/whisper");

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

let speech;
test.before(async () => {
  speech = await import("../../src/helpers/speechLanguage.mjs");
});

/** localStorage, as far as the migration uses it. */
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    snapshot: () => Object.fromEntries(values),
  };
}

/** Main's copy of the setting, as `sync-startup-preferences` leaves it. */
function withStartupLanguage(value, run) {
  const saved = process.env.LOCAL_WHISPER_LANGUAGE;
  if (value === undefined) delete process.env.LOCAL_WHISPER_LANGUAGE;
  else process.env.LOCAL_WHISPER_LANGUAGE = value;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env.LOCAL_WHISPER_LANGUAGE;
    else process.env.LOCAL_WHISPER_LANGUAGE = saved;
  }
}

test("the default speech language is English", () => {
  assert.equal(speech.DEFAULT_SPEECH_LANGUAGE, "en");
  for (const stored of [null, undefined, "", "   ", 7]) {
    assert.equal(speech.resolveSpeechLanguage(stored), "en", String(stored));
  }
  assert.equal(speech.resolveSpeechLanguage("de"), "de");
  assert.equal(speech.resolveSpeechLanguage("auto"), "auto", "auto stays a choice");
  assert.equal(speech.resolveSpeechLanguage(" en-GB "), "en-GB");
});

test("a stored auto, the old default, moves to English once", () => {
  const storage = memoryStorage({ preferredLanguage: "auto" });
  assert.equal(speech.migrateSpeechLanguageDefault(storage), true);
  assert.deepEqual(storage.snapshot(), {
    preferredLanguage: "en",
    speechLanguageDefaultMigrated: "1",
  });
  assert.equal(speech.migrateSpeechLanguageDefault(storage), false, "the second run does nothing");
  assert.equal(storage.getItem("preferredLanguage"), "en");
});

test("auto chosen after the move stays auto", () => {
  const storage = memoryStorage({ preferredLanguage: "auto" });
  speech.migrateSpeechLanguageDefault(storage);
  storage.setItem("preferredLanguage", "auto");
  for (let launch = 0; launch < 3; launch += 1) {
    assert.equal(speech.migrateSpeechLanguageDefault(storage), false);
  }
  assert.equal(storage.getItem("preferredLanguage"), "auto");

  // An install that already moved, with auto chosen since.
  const moved = memoryStorage({ preferredLanguage: "auto", speechLanguageDefaultMigrated: "1" });
  assert.equal(speech.migrateSpeechLanguageDefault(moved), false);
  assert.equal(moved.getItem("preferredLanguage"), "auto");
});

test("a language somebody chose is left alone, and the move still runs only once", () => {
  for (const chosen of ["de", "en-GB", "zh-CN"]) {
    const storage = memoryStorage({ preferredLanguage: chosen });
    assert.equal(speech.migrateSpeechLanguageDefault(storage), false, chosen);
    assert.deepEqual(storage.snapshot(), {
      preferredLanguage: chosen,
      speechLanguageDefaultMigrated: "1",
    });
  }
});

test("a new install stores nothing and reads the default", () => {
  const storage = memoryStorage();
  assert.equal(speech.migrateSpeechLanguageDefault(storage), false);
  assert.deepEqual(storage.snapshot(), { speechLanguageDefaultMigrated: "1" });
  assert.equal(speech.resolveSpeechLanguage(storage.getItem("preferredLanguage")), "en");
});

test("the renderer sends main the base code, and writes detection out", () => {
  const cases = {
    en: "en",
    "en-US": "en",
    "en-GB": "en",
    de: "de",
    "zh-CN": "zh",
    "zh-TW": "zh",
    auto: "auto",
  };
  for (const [choice, sent] of Object.entries(cases)) {
    assert.equal(speech.startupSpeechLanguage(choice), sent, choice);
  }
  for (const missing of [null, undefined, ""]) {
    assert.equal(speech.startupSpeechLanguage(missing), "en", String(missing));
  }
});

test("main reads its copy the same way: unset is English, auto is detection", () => {
  const environment = new EnvironmentManager();
  assert.equal(
    withStartupLanguage(undefined, () => environment.getSpeechLanguage()),
    "en"
  );
  assert.equal(
    withStartupLanguage("", () => environment.getSpeechLanguage()),
    "en"
  );
  assert.equal(
    withStartupLanguage("  ", () => environment.getSpeechLanguage()),
    "en"
  );
  assert.equal(
    withStartupLanguage("auto", () => environment.getSpeechLanguage()),
    "auto"
  );
  assert.equal(
    withStartupLanguage("de", () => environment.getSpeechLanguage()),
    "de"
  );

  // The twins agree for every choice the renderer can sync, and for an install
  // whose renderer has not synced yet.
  for (const choice of [null, "en", "en-US", "en-GB", "de", "zh-CN", "auto"]) {
    const synced = speech.startupSpeechLanguage(choice);
    assert.equal(
      withStartupLanguage(synced, () => environment.getSpeechLanguage()),
      synced,
      String(choice)
    );
  }
  assert.equal(
    withStartupLanguage(undefined, () => environment.getSpeechLanguage()),
    speech.startupSpeechLanguage(speech.resolveSpeechLanguage(null))
  );
});

function managerWith(installed) {
  const manager = new WhisperManager();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-speech-prewarm-"));
  for (const file of installed) fs.writeFileSync(path.join(dir, file), "");
  manager.getModelsDir = () => dir;
  manager.getVadModelPath = () => null;
  manager.ensureBundledDefaultModel = async () => null;
  manager.logDependencyStatus = async () => {};
  const starts = [];
  manager.serverManager = {
    isAvailable: () => true,
    start: async (modelPath) => {
      starts.push(path.basename(modelPath));
    },
    ready: true,
    port: 8178,
  };
  return { manager, starts, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("the launch pre-warm follows main's copy: English by default, multilingual for auto", async () => {
  const environment = new EnvironmentManager();
  const cases = [
    // A new install, or one that has not synced since English became the default.
    [undefined, "ggml-base.en.bin"],
    ["en", "ggml-base.en.bin"],
    ["auto", "ggml-base.bin"],
    ["de", "ggml-base.bin"],
  ];
  for (const [stored, warmed] of cases) {
    const { manager, starts, cleanup } = managerWith(["ggml-base.bin", "ggml-base.en.bin"]);
    try {
      const language = withStartupLanguage(stored, () => environment.getSpeechLanguage());
      await manager.initializeAtStartup({
        localTranscriptionProvider: "whisper",
        whisperModel: "base",
        language,
      });
      assert.deepEqual(starts, [warmed], String(stored));
    } finally {
      cleanup();
    }
  }
});

test("every place the speech language falls back, it falls back to English", () => {
  const store = read("src/stores/settingsStore.ts");
  assert.match(
    store,
    /preferredLanguage: resolveSpeechLanguage\(\s*readString\("preferredLanguage", DEFAULT_SPEECH_LANGUAGE\)\s*\)/,
    "the store's default"
  );

  // The move runs at module load, before the store reads the value.
  const migration = store.indexOf("migrateSpeechLanguageDefault(localStorage);");
  const call = store.indexOf("\nmigratePreferredLanguage();");
  const created = store.indexOf("export const useSettingsStore = create<SettingsState>()");
  assert.ok(
    migration > -1 && call > -1 && created > -1,
    "migration, its call or the store not found"
  );
  assert.ok(migration < call && call < created, "the move must run before the store is created");

  assert.match(
    read("src/hooks/useSettings.ts"),
    /language: startupSpeechLanguage\(preferredLanguage\)/,
    "the startup sync writes detection out"
  );
  assert.match(
    read("main.js"),
    /language: environmentManager\.getSpeechLanguage\(\),/,
    "the launch pre-warm reads main's copy through its twin"
  );
  assert.match(
    read("src/services/BaseReasoningService.ts"),
    /preferredLanguage \|\| DEFAULT_SPEECH_LANGUAGE/,
    "the cleanup prompt's language"
  );
  assert.match(
    read("src/helpers/ipcHandlers.js"),
    /const preferredLanguage = settings\?\.preferredLanguage \|\| "en";/,
    "a re-transcription sent without a language"
  );

  // Nothing falls back to detection any more.
  for (const file of [
    "main.js",
    "src/stores/settingsStore.ts",
    "src/hooks/useSettings.ts",
    "src/services/BaseReasoningService.ts",
    "src/helpers/ipcHandlers.js",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /readString\("preferredLanguage", "auto"\)/, file);
    assert.doesNotMatch(source, /preferredLanguage \|\| "auto"/, file);
    assert.doesNotMatch(source, /LOCAL_WHISPER_LANGUAGE \|\| null/, file);
  }
});

test("the pickers offer English and still offer auto", () => {
  const registry = JSON.parse(read("src/config/languageRegistry.json"));
  const byCode = new Map(registry.languages.map((language) => [language.code, language]));
  assert.equal(byCode.get("en")?.label, "English", "the default needs a name in the picker");
  assert.equal(byCode.get("en")?.whisper, true);
  assert.ok(byCode.has("auto"), "auto stays a choice in Settings");
  assert.ok(byCode.has("en-US") && byCode.has("en-GB"), "the spelling variants stay");
});

test("the setup screen and Settings write the same setting", () => {
  const write =
    /onChange=\{\(value\) =>\s*updateTranscriptionSettings\(\{ preferredLanguage: value \}\)\s*\}/;
  const onboarding = read("src/components/OnboardingFlow.tsx");
  const at = onboarding.indexOf("<LanguageSelector");
  assert.ok(at > -1, "no language picker on the setup screen");
  const picker = onboarding.slice(at, onboarding.indexOf("/>", at));
  assert.match(picker, /value=\{preferredLanguage\}/);
  assert.match(picker, write);
  assert.match(read("src/components/SettingsPage.tsx"), write);
});
