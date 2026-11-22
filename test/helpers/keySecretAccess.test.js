const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// H: which windows may read an API key's secret over IPC (keySecretAccess.js).

const { mayReadKeySecrets } = require("../../src/helpers/keySecretAccess");

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

test("both secret channels check the sender, and the agent overlay is not a reader", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "helpers", "ipcHandlers.js"),
    "utf8"
  );
  const readers = source.slice(
    source.indexOf("const secretReaders = () => ["),
    source.indexOf("const mayRead = (event)")
  );
  assert.match(readers, /this\.windowManager\?\.mainWindow/);
  assert.match(readers, /this\.windowManager\?\.controlPanelWindow/);
  assert.doesNotMatch(readers, /agent/i);
  assert.match(
    source,
    /ipcMain\.handle\("api-key-secret", \(event, id\) =>\s*mayRead\(event\) \? keys\.getApiKeySecret\(id\) : ""\s*\)/
  );
  assert.match(
    source,
    /ipcMain\.handle\("api-key-for-feature", \(event, feature, provider\) =>\s*mayRead\(event\) \? keys\.getFeatureKeyRecord\(feature, provider\) : null\s*\)/
  );
});
