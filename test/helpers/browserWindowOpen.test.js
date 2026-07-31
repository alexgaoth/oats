const test = require("node:test");
const assert = require("node:assert/strict");

let newWindowCommand;

test.before(async () => {
  ({ newWindowCommand } = await import("../../src/helpers/browserWindowOpen.mjs"));
});

test("known browsers resolve to a new-window invocation", () => {
  const url = "https://www.google.com/search?q=test";
  assert.deepEqual(newWindowCommand("firefox.desktop", url), {
    command: "firefox",
    args: ["--new-window", url],
  });
  // Variants must resolve without needing an entry each.
  assert.equal(newWindowCommand("firefox-esr.desktop", url).command, "firefox");
  assert.equal(
    newWindowCommand("google-chrome-stable.desktop", url).command,
    "google-chrome-stable"
  );
  assert.equal(newWindowCommand("brave-browser-nightly.desktop", url).command, "brave-browser");
  assert.equal(newWindowCommand("Chromium.Desktop", url).command, "chromium");
});

test("an unknown or missing browser falls back rather than guessing a command", () => {
  const url = "https://www.google.com/search?q=test";
  // Guessing an executable would spawn something arbitrary; the caller uses the
  // desktop's own handler instead.
  assert.equal(newWindowCommand("some-obscure-browser.desktop", url), null);
  assert.equal(newWindowCommand("", url), null);
  assert.equal(newWindowCommand(null, url), null);
  assert.equal(newWindowCommand("firefox.desktop", ""), null);
});
