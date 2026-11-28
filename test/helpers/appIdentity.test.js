const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The app is called Barley (Alex, 2026-11-28). It was Oats before 0.4.0, and a
// person who updates must find everything where it was. So the name that
// people see changes, and the names that hold their data do not.

const ROOT = path.join(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const builder = JSON.parse(fs.readFileSync(path.join(ROOT, "electron-builder.json"), "utf8"));

test("the data folder stays <appData>/oats", () => {
  // Electron sets userData from package.json productName, else name, before
  // main.js runs. A productName here would move everyone's conversations.
  assert.equal(pkg.name, "oats");
  assert.equal(pkg.productName, undefined);
});

test("the bundle ID stays com.arum.oats", () => {
  // macOS keys the microphone and accessibility grants, the keychain items
  // and the Developer ID signature's requirement on it.
  assert.equal(builder.appId, "com.arum.oats");
});

test("the app people see is Barley", () => {
  assert.equal(builder.productName, "Barley");
  assert.equal(builder.dmg.title, "Barley");
  const prompts = Object.entries(builder.mac.extendInfo).filter(([key]) => /UsageDescription$/.test(key));
  assert.ok(prompts.length >= 3);
  for (const [key, text] of prompts) {
    assert.match(text, /^Barley /, key);
    assert.doesNotMatch(text, /Oats/, key);
  }
  const main = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
  assert.match(main, /app\.setName\("Barley"\)/);
});
