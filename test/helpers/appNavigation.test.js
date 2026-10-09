const test = require("node:test");
const assert = require("node:assert/strict");

const { isInternalNavigation } = require("../../src/helpers/appNavigation");

const DEV_PANEL_URL = "http://localhost:5183/?panel=true";
const PACKAGED_PAGE =
  "file:///Applications/Oats.app/Contents/Resources/app.asar/src/dist/index.html?panel=true";

// The regression this file exists for. A packaged build has no app URL —
// DevServerManager.getAppUrl() returns null and the page comes from loadFile() —
// and the will-navigate handler threw on it before preventDefault(), so a link
// opened inside the app window, with the preload bridge, instead of the browser.
test("a packaged build (no app URL) sends a web link to the browser instead of throwing", () => {
  assert.doesNotThrow(() => isInternalNavigation("https://example.com/", null));
  assert.equal(isInternalNavigation("https://example.com/", null), false);
  assert.equal(isInternalNavigation("http://example.com/page", undefined), false);
  assert.equal(isInternalNavigation("mailto:someone@example.com", null), false);
});

test("the bundled page and the devtools stay inside the window", () => {
  assert.equal(isInternalNavigation(PACKAGED_PAGE, null), true);
  assert.equal(isInternalNavigation("devtools://devtools/bundled/inspector.html", null), true);
  assert.equal(isInternalNavigation(PACKAGED_PAGE, DEV_PANEL_URL), true);
});

test("in development the dev server's panel stays inside and the web leaves", () => {
  assert.equal(isInternalNavigation(DEV_PANEL_URL, DEV_PANEL_URL), true);
  assert.equal(isInternalNavigation(`${DEV_PANEL_URL}#settings`, DEV_PANEL_URL), true);
  assert.equal(isInternalNavigation("https://example.com/", DEV_PANEL_URL), false);
});

test("a missing or empty target never stays inside", () => {
  assert.equal(isInternalNavigation(undefined, DEV_PANEL_URL), false);
  assert.equal(isInternalNavigation("", null), false);
  assert.equal(isInternalNavigation("", ""), false);
});
