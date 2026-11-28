const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The app is called Barley (Alex, 2026-11-28). It was called Oats before.
// Every string a person reads comes from these translation files, so a new
// string that still says "Oats" is a mistake. Code names (OatsWorkspace,
// the "oats." keys), the data folder and the keychain service keep the old
// name on purpose: they are not shown, and renaming them would move data.

const LOCALES = path.join(__dirname, "../../src/locales");

function collect(value, at, hits) {
  if (typeof value === "string") {
    if (value.includes("Oats")) hits.push(`${at}: ${value}`);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collect(child, `${at}.${key}`, hits);
  }
}

test("no translation still calls the app Oats", () => {
  const locales = fs
    .readdirSync(LOCALES)
    .filter((name) => fs.existsSync(path.join(LOCALES, name, "translation.json")));
  assert.ok(locales.length >= 10, `found ${locales.length} locales`);

  const hits = [];
  for (const locale of locales) {
    const file = path.join(LOCALES, locale, "translation.json");
    collect(JSON.parse(fs.readFileSync(file, "utf8")), locale, hits);
  }
  assert.deepEqual(hits, []);
});

test("every translation names the app Barley", () => {
  for (const locale of fs.readdirSync(LOCALES)) {
    const file = path.join(LOCALES, locale, "translation.json");
    if (!fs.existsSync(file)) continue;
    assert.match(fs.readFileSync(file, "utf8"), /Barley/, `${locale} never says Barley`);
  }
});
