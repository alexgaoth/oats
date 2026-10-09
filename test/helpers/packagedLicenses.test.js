const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// A third-party component shipped in binary form carries its licence with it —
// BSD-3-Clause says so in as many words. electron-builder skips a missing
// `from` with a warning and builds anyway, which is how the MediaRemoteAdapter
// licence went missing from every package without anything failing.

const root = path.join(__dirname, "..", "..");
const builder = JSON.parse(fs.readFileSync(path.join(root, "electron-builder.json"), "utf8"));

test("every licence file the build packages exists in the repository", () => {
  const entries = [
    ...(builder.extraResources ?? []),
    ...(builder.mac?.extraResources ?? []),
    ...(builder.linux?.extraResources ?? []),
  ];
  const licences = entries
    .map((entry) => (typeof entry === "string" ? entry : entry?.from))
    .filter((from) => typeof from === "string" && /licen[cs]e/i.test(from));
  assert.ok(licences.length > 0, "the build packages at least one licence");
  for (const from of licences) {
    assert.ok(fs.existsSync(path.join(root, from)), `packaged licence missing: ${from}`);
  }
});
