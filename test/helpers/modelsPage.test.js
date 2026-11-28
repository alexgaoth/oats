const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Settings › AI models after Alex's review of v0.4 (2026-11-22): every row
// says Ready when its model is ready (with the key it uses on the key route),
// each row's place is a quiet menu that moves that feature alone, and the
// processing choice shows a Mixed card while the features run in different
// places. The routing itself is pinned in featureRoutes.test.js.

const ROOT = path.join(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const PAGE = read("src/components/settings/ModelsPage.tsx");
const CHOICE = read("src/components/settings/ProcessingChoice.tsx");
const ROW = read("src/components/settings/FeatureModelRow.tsx");

test("the processing choice shows Mixed while the routes differ, and Mixed changes nothing", () => {
  assert.match(PAGE, /useSettingsStore\(\(state\) => selectProcessingChoice\(state\)\)/);
  assert.match(PAGE, /onChange=\{setProcessing\}/);
  // Pressing Mixed calls nothing: it is a state, not a choice.
  assert.match(CHOICE, /if \(mode !== "mixed"\) onChange\(mode\);/);
  // Closed, its slot is hidden from assistive tech and out of the tab order.
  assert.match(CHOICE, /aria-hidden=\{!mixed \|\| undefined\}\s*inert=\{!mixed\}/);
  // It opens and closes by its width and opacity, and at once under reduced motion.
  assert.match(
    CHOICE,
    /"transition-\[flex-grow,margin-left,opacity\] \[transition-duration:var\(--motion-base\)\] motion-reduce:transition-none"/
  );
  assert.match(CHOICE, /mixed \? "ml-3 grow opacity-100" : "ml-0 grow-0 opacity-0"/);
});

test("each feature has one row, the same in Settings and setup", () => {
  for (const feature of ["conversations", "dictation", "writing"]) {
    assert.match(PAGE, new RegExp(`<FeatureModelRow\\s+feature="${feature}"`));
  }
  // A model on this Mac that is on disk is Ready; on the API-key route the
  // feature's own key says Ready with its name, or that it was refused, and
  // with no key the row offers one, in place.
  assert.match(ROW, /row = \{ model: localName, place: "local", status: \{ kind: "ready" \} \};/);
  assert.match(
    ROW,
    /function keyStatus\(key: SavedKey \| null, provider: KeyProvider, choosable = false\): ModelStatus \{\s*if \(!key\) return choosable \? \{ kind: "choose-key" \} : \{ kind: "add-key", provider \};\s*return keyUsable\(key\.status\)\s*\? \{ kind: "ready", key: key\.name, keyed: true \}\s*: \{ kind: "refused", key: key\.name \};/
  );
  assert.match(ROW, /key: selectFeatureKey\(state, feature\),/);
  assert.match(ROW, /t\("oats\.models\.readyWithKey", \{ key: status\.key \}\)/);
});

test("a row's place moves that feature alone, and speech needs an OpenAI key", () => {
  assert.match(
    ROW,
    /if \(next !== requested\) setFeatureProcessing\(feature, next as ProcessingMode\);/
  );
  assert.match(
    ROW,
    /!keys\.some\(\(key\) => key\.provider === "openai"\) &&\s*keys\.some\(\(key\) => key\.provider === "anthropic"\)/
  );
  // Both key places (the key, and the key with rooms on this Mac) are off then.
  assert.match(ROW, /const keyOff = noSpeechKey && requested !== "providers";/);
  assert.equal(ROW.match(/disabled=\{keyOff\}/g)?.length, 2);
  assert.match(ROW, /aria-describedby=\{noSpeechKey \? reasonId : undefined\}/);
  assert.match(ROW, /\{t\("oats\.featureRoutes\.speechNeedsOpenAI"\)\}/);
});

// Alex, 2026-11-27: the API-key route keeps its default, and a Mac that runs
// Parakeet Ultra is offered it for rooms. Calls stay on the key.
test("with an API key, a Mac that runs Parakeet Ultra is offered it for rooms", () => {
  const STORE = read("src/stores/settingsStore.ts");
  const RECORDING = read("src/stores/meetingRecordingStore.ts");
  // The same rule as the default on this Mac (planLocalSetup), and the room
  // plan follows the choice on the key route.
  assert.match(
    STORE,
    /return localSetupFor\(tier, state\.preferredLanguage, "local"\)\.speech\.engine === "parakeet";/
  );
  assert.match(
    STORE,
    /: roomsOnThisMac\(state\.featurePreferences\);\s*if \(!chosen\) return null;/
  );
  // Settings only (setup shows the status), never while a conversation is recorded.
  assert.match(ROW, /if \(feature === "conversations" && macRuns && room\.available\) \{/);
  assert.match(ROW, /if \(menus && !recording\) \{/);
  // The offer: the measured gain over GPT Transcribe and the size, then
  // Download, which keeps rooms here and fetches the model.
  assert.match(ROW, /"parakeetCloud",\s*ROOM_MODEL_NAME,\s*room\.installed \? null : size/);
  assert.match(
    ROW,
    /onClick: \(\) => \{\s*chooseRoomsOnThisMac\(true\);\s*if \(!room\.installed\) requestRoomModel\(\);/
  );
  // Cancel is a no: rooms go back to the key.
  assert.match(ROW, /cancelRoomModelDownload\(false\);\s*chooseRoomsOnThisMac\(false\);/);
  // Its menu's third place, and the row says it only with the model on disk.
  assert.match(ROW, /value="providers-rooms"/);
  assert.match(ROW, /\{t\("oats\.featureRoutes\.roomsMacChoice"\)\}/);
  assert.match(ROW, /if \(roomsHere && room\.installed\) row\.place = "providers-rooms";/);
  // A room moves to this Mac only with the model on disk; until then it streams.
  assert.match(
    RECORDING,
    /if \(!status\?\.downloaded && selectFeatureRoute\(state, "conversations"\)\.effective !== "local"\) \{\s*return shared;/
  );
  // What goes to the provider says so.
  assert.match(
    CHOICE,
    /selectRoomsOnThisMac\(state\) && macRunsRoomParakeet\(state, tier\) && installed/
  );
});

// Alex, 2026-11-22: the green pill is the key; pressing it chooses another.
test("the key pill opens the feature's key menu, and a key added from a row is that row's", () => {
  // Every saved key, the current one checked; one that cannot serve the
  // feature is off and says why; then Add API key….
  assert.match(ROW, /t\("oats\.keys\.keyFor", \{ feature: name \}\)/);
  assert.match(ROW, /if \(id !== current\) chooseFeatureKey\(feature, id\);/);
  assert.match(ROW, /disabled=\{!option\.usable && !current\}/);
  assert.match(ROW, /option\.reason === "no-speech"\s*\? t\("oats\.keys\.reasonNoSpeech"\)/);
  assert.match(ROW, /onSelectAfterClose=\{\(\) => setAdding\(true\)\}/);
  assert.match(ROW, /<ProviderKeyField provider=\{provider\} forFeature=\{feature\} autoFocus \/>/);
  // Writing whose key was removed, while another saved key can run it (keys
  // never move to the other provider by themselves): "on this Mac until you
  // choose a key", and Choose a key opens the same menu, with none checked.
  assert.match(ROW, /selectKeyOptions\(state, "writing"\)\.some\(\(option\) => option\.usable\)/);
  assert.match(ROW, /place: key \? "until-works" : choosable \? "until-chosen" : "until-key"/);
  assert.match(
    ROW,
    /tone="neutral"[^>]*>\s*<KeyRound aria-hidden="true" \/>\s*\{t\("oats\.keys\.chooseKey"\)\}/
  );
});

test("the API keys list renames in place and asks before it removes, saying where features go", () => {
  const LIST = read("src/components/settings/ApiKeysList.tsx");
  assert.match(PAGE, /<ApiKeysList \/>/);
  // KeyCapabilities said what the list and the key menus now say.
  assert.doesNotMatch(PAGE, /KeyCapabilities/);
  assert.match(LIST, /renameApiKey\(savedKey\.id, draft\);/);
  assert.match(LIST, /selectRemovalPlan\(\{ keyRecords, featurePreferences \}, savedKey\.id\)/);
  assert.match(LIST, /t\("oats\.keys\.moveTo", \{ key: to\.name, features: list\(features\) \}\)/);
  // A removal main could not make rejects with a line to show; the key and
  // the question stay, with that line under them.
  assert.match(
    LIST,
    /await removeApiKey\(savedKey\.id\)\.catch\(\(error: unknown\) => \{\s*setFailure\(/
  );
  assert.match(LIST, /role="alert"[^>]*>\s*\{failure\}/);
  assert.doesNotMatch(LIST, /confirm\(/);
  assert.match(LIST, /t\("oats\.keys\.notInUse"\)/);
});
