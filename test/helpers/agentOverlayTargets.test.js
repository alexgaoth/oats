const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The agent overlay keeps to the rules every Oats control follows: icon-only
// buttons are named and at least 24x24, text is 12px or more in sentence case,
// and secondary text uses the muted token rather than a faded foreground (the
// empty state's foreground/25 measured about 2:1 on dark).

const ROOT = path.join(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const LOCALES = ["en", "es", "fr", "de", "pt", "it", "ru", "ja", "zh-CN", "zh-TW"];
const locale = (lang) => JSON.parse(read(`src/locales/${lang}/translation.json`));

function buttons(source) {
  return source
    .split("<button")
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf(">\n")));
}

test("every icon button in the overlay is named and 24x24", () => {
  for (const file of [
    "src/components/agent/AgentTitleBar.tsx",
    "src/components/chat/ChatInput.tsx",
  ]) {
    const found = buttons(read(file));
    assert.ok(found.length >= 2, `${file} has its buttons`);
    for (const button of found) {
      assert.match(button, /aria-label=\{t\("[\w.]+"\)\}/, `${file}: a button has a name`);
      assert.match(button, /\bsize-6\b/, `${file}: a button is 24x24`);
      assert.doesNotMatch(button, /\bp-1 rounded-sm/, `${file}: no 22px padding box`);
    }
  }
});

test("a reply's Copy is named, 24x24 and shows when focused", () => {
  const message = read("src/components/chat/ChatMessage.tsx");
  const at = message.indexOf("onClick={handleCopy}");
  assert.ok(at >= 0);
  const button = message.slice(at, message.indexOf(">\n", at));
  assert.match(button, /aria-label=\{t\("common\.copy"\)\}/);
  assert.match(button, /\bsize-6\b/);
  assert.match(button, /focus-visible:opacity-100/);
  for (const lang of LOCALES) assert.ok(locale(lang).common.copy, `${lang}: common.copy`);
});

test("the title bar's buttons clear the window's 5px resize edge", () => {
  const title = read("src/components/agent/AgentTitleBar.tsx");
  const overlay = read("src/components/AgentOverlay.tsx");
  assert.match(overlay, /absolute top-0 left-2 right-2 h-\[5px\] cursor-n-resize/);
  // A 36px bar centres a 24px button 6px down, clear of the 5px edge.
  assert.match(title, /"flex items-center justify-between h-9 px-3"/);
});

test("Send and Cancel have names in every locale", () => {
  const input = read("src/components/chat/ChatInput.tsx");
  assert.match(input, /onClick=\{onCancel\}\s+aria-label=\{t\("common\.cancel"\)\}/);
  assert.match(
    input,
    /onClick=\{handleSubmit\}[\s\S]{0,80}aria-label=\{t\("agentMode\.input\.send"\)\}/
  );
  for (const lang of LOCALES) {
    const strings = locale(lang);
    assert.ok(strings.agentMode.input.send, `${lang}: agentMode.input.send`);
    assert.ok(strings.common.cancel, `${lang}: common.cancel`);
  }
});

test("the overlay's words are 12px or more, sentence case, in readable tokens", () => {
  const title = read("src/components/agent/AgentTitleBar.tsx");
  const chat = read("src/components/agent/AgentChat.tsx");
  const input = read("src/components/chat/ChatInput.tsx");
  for (const source of [title, chat, input]) {
    assert.doesNotMatch(source, /text-\[(?:10|11)px\]/);
    assert.doesNotMatch(source, /\buppercase\b/);
  }
  assert.doesNotMatch(chat, /text-foreground\/(?:25|50)/);
  assert.match(chat, /text-xs text-muted-foreground/);
  assert.doesNotMatch(input, /placeholder:text-muted-foreground\/\d+/);
});

test("the message field is a 24px tall target", () => {
  const input = read("src/components/chat/ChatInput.tsx");
  assert.match(input, /"h-6 min-w-0 p-0"/);
});
