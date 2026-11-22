const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Setup's step "Where Oats thinks" with an API key: one press. A key pasted
// there and not saved yet is checked and saved by Continue itself; a key
// the provider refuses keeps the step, with the reason under the field. Save
// stays for Settings (components/settings/ProviderKeyField.tsx).

const ROOT = path.join(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const FIELD = read("src/components/settings/ProviderKeyField.tsx");
const STEP = read("src/components/onboarding/ProcessingStep.tsx");
const FLOW = read("src/components/OnboardingFlow.tsx");

test("the key field checks and saves through one commit, which another button can press", () => {
  // The form's Save and the handle are the same commit.
  assert.match(FIELD, /const commit = async \(\): Promise<boolean> => \{/);
  assert.match(FIELD, /useImperativeHandle\(ref, \(\) => \(\{ commit \}\)\);/);
  assert.match(
    FIELD,
    /const save = \(event: React\.FormEvent\) => \{\s*event\.preventDefault\(\);\s*void commit\(\);/
  );
  // A key the provider calls invalid is refused, before anything is saved.
  const commit = FIELD.slice(
    FIELD.indexOf("const commit = async"),
    FIELD.indexOf("useImperativeHandle(")
  );
  const refused = commit.indexOf(
    'if (status === "rejected" || status === "no-access" || status === "unknown")'
  );
  const stored = commit.indexOf("SETTERS[target]");
  assert.ok(refused > -1 && stored > refused, "refused before it is stored");
  assert.match(commit.slice(refused, stored), /return false;/);
  assert.match(commit, /return true;\s*\};\s*$/);
  // Save is shown unless the caller saves the key itself.
  assert.match(FIELD, /showSave = true,/);
  assert.match(FIELD, /\{showSave && \(\s*<Button type="submit"/);
});

test("setup has no Save: Continue checks and saves the pasted key, and stays on a refusal", () => {
  assert.match(
    STEP,
    /<ProviderKeyField\s+ref=\{keyField\}\s+provider="any"\s+showSave=\{false\}\s+onDraftChange=\{onKeyDraft\}\s*\/>/
  );
  const forward = FLOW.slice(FLOW.indexOf("const goForward = async () => {"));
  assert.match(
    forward,
    /if \(processingChoice === "providers" && keyDraft\.trim\(\)\) \{\s*if \(field\) \{\s*setCheckingKey\(true\);\s*const saved = await field\.commit\(\);\s*setCheckingKey\(false\);\s*if \(!saved\) return;\s*\} else \{[\s\S]{0,160}setKeyDraft\(""\);\s*if \(!providerKeySaved\) return;\s*\}\s*\}\s*setProcessing\(processingChoice\)/
  );
  // A pasted key is enough to press Continue; a saved one too.
  assert.match(
    FLOW,
    /return processingChoice === "local" \|\| providerKeySaved \|\| keyDraft\.trim\(\)\.length > 0;/
  );
  // Nothing else can be pressed while the key is checked.
  assert.match(FLOW, /disabled=\{!canProceed\(\) \|\| isFinishing \|\| checkingKey\}/);
  assert.match(FLOW, /disabled=\{isFinishing \|\| checkingKey\}/);
});

test("the pasted key's text goes with its field: Continue never does nothing", () => {
  // Another option hides the field; going back shows it empty, so the text the
  // flow knows of is cleared with it.
  assert.match(
    FLOW,
    /onChange=\{\(mode\) => \{[\s\S]{0,120}setProcessingChoice\(mode\);\s*setKeyDraft\(""\);\s*\}\}/
  );
  // And a field that unmounts for any other reason (Back) says so.
  assert.match(FIELD, /useEffect\(\(\) => \(\) => draftListener\.current\?\.\(""\), \[\]\);/);
  // The commit refuses an empty field without a word, so nothing calls it then.
  assert.match(FIELD, /if \(!key \|\| checking\) return false;/);
  assert.match(FLOW, /if \(processingChoice === "providers" && keyDraft\.trim\(\)\) \{/);
});

// Setup's third step, "Your models" (Alex, 2026-11-22): the models "Where Oats
// thinks" chose, downloading and then Ready. Its Continue starts them.
test("Your models follows Where Oats thinks, and its downloads start on that Continue", () => {
  const MODELS = read("src/components/onboarding/ModelsStep.tsx");
  assert.match(
    FLOW,
    /\{ id: "processing", title: t\("onboarding\.steps\.processing"\), icon: Cpu \},\s*\{ id: "models", title: t\("onboarding\.steps\.models"\), icon: Sparkles \},/
  );
  // The same rows as Settings, with the status only.
  for (const feature of ["conversations", "dictation", "writing"]) {
    assert.match(MODELS, new RegExp(`<FeatureModelRow feature="${feature}" menus=\\{false\\} />`));
  }
  // Get started does not wait for the downloads.
  assert.match(FLOW, /case "models":\s*\/\/[^\n]*\n\s*return true;/);
  // The choice is committed, then speech without an OpenAI key stays here as
  // its own route, then the downloads may start.
  const forward = FLOW.slice(FLOW.indexOf("const goForward = async () => {"));
  const order = [
    "setProcessing(processingChoice);",
    'setFeatureProcessing("conversations", "local");',
    'setFeatureProcessing("dictation", "local");',
    "await prepareLocalSetup()",
    "localStorage.setItem(SETUP_PROCESSING_DONE",
  ].map((text) => forward.indexOf(text));
  assert.ok(
    order.every((at, index) => at > -1 && (index === 0 || at > order[index - 1])),
    order
  );
  assert.match(
    forward,
    /if \(processingChoice === "providers" && speechHere\) \{\s*setFeatureProcessing\("conversations", "local"\);/
  );
});
