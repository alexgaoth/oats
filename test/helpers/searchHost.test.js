const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/searchHost.ts");

// DESIGN.md §9.2: the question card must read `searched · google`, not just
// "searched". Auto-search is the one outbound action in the product, so naming
// where the text went is a correctness requirement, not a label.

test("names the host a search actually went to", async () => {
  const { searchHostLabel } = await load();
  assert.equal(searchHostLabel("https://www.google.com/search"), "google.com");
  assert.equal(searchHostLabel("https://duckduckgo.com/"), "duckduckgo.com");
  assert.equal(searchHostLabel("https://search.marginalia.nu/search"), "search.marginalia.nu");
  assert.equal(searchHostLabel("http://localhost:8080/q"), "localhost");
});

test("names nothing rather than inventing a host", async () => {
  const { searchHostLabel } = await load();
  // The card falls back to a bare "searched" on these — saying the wrong
  // destination is worse than saying none.
  for (const bad of ["", null, undefined, "not a url", "/relative/search"]) {
    assert.equal(searchHostLabel(bad), "", `expected no host for ${JSON.stringify(bad)}`);
  }
});
