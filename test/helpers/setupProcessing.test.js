const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Setup's step "Where Oats thinks" with an API key: one press. A key pasted
// there and not saved yet is checked and saved by Get started itself; a key
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
  const refused = commit.indexOf('if (status === "rejected")');
  const stored = commit.indexOf("SETTERS[target]");
  assert.ok(refused > -1 && stored > refused, "refused before it is stored");
  assert.match(commit.slice(refused, stored), /return false;/);
  assert.match(commit, /return true;\s*\};\s*$/);
  // Save is shown unless the caller saves the key itself.
  assert.match(FIELD, /showSave = true,/);
  assert.match(FIELD, /\{showSave && \(\s*<Button type="submit"/);
});

test("setup has no Save: Get started checks and saves the pasted key, and stays on a refusal", () => {
  assert.match(
    STEP,
    /<ProviderKeyField\s+ref=\{keyField\}\s+provider="any"\s+showSave=\{false\}\s+onDraftChange=\{onKeyDraft\}\s*\/>/
  );
  const forward = FLOW.slice(FLOW.indexOf("const goForward = async () => {"));
  assert.match(
    forward,
    /if \(processingChoice === "providers" && keyDraft\.trim\(\)\) \{\s*if \(field\) \{\s*setCheckingKey\(true\);\s*const saved = await field\.commit\(\);\s*setCheckingKey\(false\);\s*if \(!saved\) return;\s*\} else \{[\s\S]{0,160}setKeyDraft\(""\);\s*if \(!providerKeySaved\) return;\s*\}\s*\}\s*commitProcessing\(/
  );
  // A pasted key is enough to press Get started; a saved one too.
  assert.match(
    FLOW,
    /return processingChoice === "local" \|\| providerKeySaved \|\| keyDraft\.trim\(\)\.length > 0;/
  );
  // Nothing else can be pressed while the key is checked.
  assert.match(FLOW, /disabled=\{!canProceed\(\) \|\| isFinishing \|\| checkingKey\}/);
  assert.match(FLOW, /disabled=\{isFinishing \|\| checkingKey\}/);
});

test("the pasted key's text goes with its field: Get started never does nothing", () => {
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
