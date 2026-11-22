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
  // A model on this Mac that is on disk, and a model on a usable key, are Ready.
  assert.match(ROW, /row = \{ model: localName, place: "local", status: \{ kind: "ready" \} \};/);
  assert.match(ROW, /status: \{ kind: "ready", key: keyLabel \}/);
  assert.match(ROW, /t\("oats\.models\.readyWithKey", \{ key: status\.key \}\)/);
  // A key the provider refused says so; no key offers one, in place.
  assert.match(
    ROW,
    /status: refused\s*\? \{ kind: "refused", key: keyLabel \}\s*: \{ kind: "add-key", provider: "openai" \}/
  );
});

test("a row's place moves that feature alone, and speech needs an OpenAI key", () => {
  assert.match(
    ROW,
    /if \(value !== requested\) setFeatureProcessing\(feature, value as ProcessingMode\);/
  );
  assert.match(
    ROW,
    /feature !== "writing" && !state\.openaiApiKey\.trim\(\) && Boolean\(state\.anthropicApiKey\.trim\(\)\)/
  );
  assert.match(ROW, /disabled=\{noSpeechKey && requested !== "providers"\}/);
  assert.match(ROW, /aria-describedby=\{noSpeechKey \? reasonId : undefined\}/);
  assert.match(ROW, /\{t\("oats\.featureRoutes\.speechNeedsOpenAI"\)\}/);
});
