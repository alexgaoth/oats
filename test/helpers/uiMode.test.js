const test = require("node:test");
const assert = require("node:assert/strict");

let DEFAULT_UI_MODE, resolveUiMode, toggleUiMode, isFieldMode;

test.before(async () => {
  ({ DEFAULT_UI_MODE, resolveUiMode, toggleUiMode, isFieldMode } = await import(
    "../../src/helpers/uiMode.mjs"
  ));
});

test("an unknown stored mode resolves to the ledger, not to nothing", () => {
  for (const bad of [null, undefined, "", "beauty", "FIELD", 7]) {
    assert.equal(resolveUiMode(bad), DEFAULT_UI_MODE);
  }
  assert.equal(DEFAULT_UI_MODE, "work");
});

test("the two modes toggle into each other and nowhere else", () => {
  assert.equal(toggleUiMode("work"), "field");
  assert.equal(toggleUiMode("field"), "work");
  assert.equal(toggleUiMode("nonsense"), "field", "a corrupt value toggles off the default");
  assert.equal(isFieldMode("field"), true);
  assert.equal(isFieldMode("work"), false);
  assert.equal(isFieldMode(null), false);
});
