const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// H: which windows may read an API key's secret over IPC (keySecretAccess.js).

const { mayReadKeySecrets, mayReadFeatureKey } = require("../../src/helpers/keySecretAccess");

function windowWith(contents, { destroyed = false } = {}) {
  return { webContents: contents, isDestroyed: () => destroyed };
}
const contents = (name) => ({ name, isDestroyed: () => false });

test("only the main window and the control panel, from their top frame, read secrets", () => {
  const main = contents("main");
  const panel = contents("control panel");
  const overlay = contents("agent overlay");
  const readers = [windowWith(main), windowWith(panel)];
  const top = { parent: null };
  assert.equal(mayReadKeySecrets({ sender: main, senderFrame: top }, readers), true);
  assert.equal(mayReadKeySecrets({ sender: panel, senderFrame: top }, readers), true);
  // The agent overlay runs without the sandbox and with web security off.
  assert.equal(mayReadKeySecrets({ sender: overlay, senderFrame: top }, readers), false);
  // A frame inside a page of the control panel.
  assert.equal(mayReadKeySecrets({ sender: panel, senderFrame: { parent: top } }, readers), false);
  // A closed window, or no sender at all.
  assert.equal(mayReadKeySecrets({ sender: main }, [windowWith(main, { destroyed: true })]), false);
  assert.equal(
    mayReadKeySecrets({ sender: { isDestroyed: () => true } }, [windowWith(main)]),
    false
  );
  assert.equal(mayReadKeySecrets(null, readers), false);
  assert.equal(mayReadKeySecrets({ sender: main }, [null, undefined]), false);
});

test("the agent overlay may ask main for Dictation's OpenAI key, and for no other key", () => {
  const main = contents("main");
  const overlay = contents("agent overlay");
  const readers = [windowWith(main)];
  const dictating = [windowWith(overlay)];
  const top = { parent: null };
  const asks = (sender, feature, provider, frame = top) =>
    mayReadFeatureKey({ sender, senderFrame: frame }, feature, provider, readers, dictating);
  // Its voice input is transcribed with Dictation's key (AgentOverlay.tsx).
  assert.equal(asks(overlay, "dictation", "openai"), true);
  for (const [feature, provider] of [
    ["conversations", "openai"],
    ["writing", "openai"],
    ["writing", "anthropic"],
    ["dictation", "anthropic"],
    ["dictation", undefined],
    [undefined, "openai"],
  ]) {
    assert.equal(asks(overlay, feature, provider), false, `${feature} ${provider}`);
  }
  assert.equal(asks(overlay, "dictation", "openai", { parent: top }), false);
  assert.equal(
    mayReadFeatureKey({ sender: overlay }, "dictation", "openai", readers, [
      windowWith(overlay, { destroyed: true }),
    ]),
    false
  );
  // A reader asks for any feature's key; any other window for none.
  assert.equal(asks(main, "writing", "anthropic"), true);
  assert.equal(asks(contents("other"), "dictation", "openai"), false);
  // A key by its id: never the overlay.
  assert.equal(mayReadKeySecrets({ sender: overlay, senderFrame: top }, readers), false);
});

test("both secret channels check the sender; the overlay asks only by feature", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "helpers", "ipcHandlers.js"),
    "utf8"
  );
  const start = source.indexOf("const secretReaders = () => [");
  const readers = source.slice(start, source.indexOf("];", start));
  assert.match(readers, /this\.windowManager\?\.mainWindow/);
  assert.match(readers, /this\.windowManager\?\.controlPanelWindow/);
  assert.doesNotMatch(readers, /agent/i);
  assert.match(source, /const dictationReaders = \(\) => \[this\.windowManager\?\.agentWindow\];/);
  assert.match(
    source,
    /const mayRead = \(event\) => mayReadKeySecrets\(event, secretReaders\(\)\) \|\| refused\(\);/
  );
  assert.match(
    source,
    /mayReadFeatureKey\(event, feature, provider, secretReaders\(\), dictationReaders\(\)\)/
  );
  assert.match(
    source,
    /ipcMain\.handle\("api-key-secret", \(event, id\) =>\s*mayRead\(event\) \? keys\.getApiKeySecret\(id\) : ""\s*\)/
  );
  assert.match(
    source,
    /ipcMain\.handle\("api-key-for-feature", \(event, feature, provider\) =>\s*mayReadFor\(event, feature, provider\) \? keys\.getFeatureKeyRecord\(feature, provider\) : null\s*\)/
  );
});
