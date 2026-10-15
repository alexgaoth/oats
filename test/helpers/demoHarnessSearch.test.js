const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The demo harness's auto-search: off unless `autosearch=1`, and a search the
// app opens is written down instead of reaching a browser, so a film can show
// the browser opening at that moment.

const root = path.join(__dirname, "../..");
const SETTINGS = fs.readFileSync(path.join(root, "demo/harness/settings.mjs"), "utf8");

test("auto-search is off in the demo unless autosearch=1 asks for it", () => {
  assert.match(
    SETTINGS,
    /set\("conversationAutoSearchEnabled", params\.get\("autosearch"\) === "1" \? "true" : "false"\)/
  );
});

test("a search the app opens is recorded, in order, and reported as opened", async () => {
  const { createFakeMain } = await import("../../demo/harness/fake-main.mjs");
  const main = createFakeMain({ fixtures: [] });
  assert.deepEqual(main.searches, []);
  const result = await main.api.openConversationSearch({
    eventId: 7,
    query: "How long does the full migration take on production?",
    searchBaseUrl: "https://www.google.com/search",
  });
  assert.deepEqual(result, { success: true });
  assert.equal(main.searches.length, 1);
  assert.equal(main.searches[0].query, "How long does the full migration take on production?");
  assert.equal(main.searches[0].searchBaseUrl, "https://www.google.com/search");
  assert.equal(typeof main.searches[0].at, "number");
});
