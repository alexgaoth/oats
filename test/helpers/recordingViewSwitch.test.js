const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// DESIGN.md §2, "Character for the choices that matter": what the recording
// view shows is one of the few choices drawn with a view switch. Source-level:
// the switch needs a browser to render (its behaviour is pinned in
// viewSwitch.test.js).

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const DETAIL = read("src/helpers/conversationDetail.mjs");

test("Calm or Words is a view switch over the two compositions", () => {
  assert.match(WORKSPACE, /<ViewSwitch<ConversationDetail>/);
  assert.match(
    WORKSPACE,
    /value: "clean",\s*label: t\("oats\.conversation\.view\.calm"\),\s*icon: WavesHorizontal/
  );
  assert.match(
    WORKSPACE,
    /value: "detailed",\s*label: t\("oats\.conversation\.view\.words"\),\s*icon: Captions/
  );
  assert.match(WORKSPACE, /onValueChange=\{setDetail\}/);
});

test("the old show and hide button is gone, with its strings and its toggle", () => {
  assert.doesNotMatch(WORKSPACE, /showDetailed|showClean|toggleConversationDetail/);
  assert.doesNotMatch(DETAIL, /toggleConversationDetail/);
  const locales = fs
    .readdirSync(path.join(__dirname, "../../src/locales"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(locales.length, 10);
  for (const locale of locales) {
    const strings = JSON.parse(read(`src/locales/${locale}/translation.json`));
    const conversation = strings.oats.conversation;
    assert.equal(conversation.showDetailed, undefined, locale);
    assert.equal(conversation.showClean, undefined, locale);
    for (const key of ["label", "calm", "words"]) {
      assert.ok(conversation.view?.[key], `${locale} oats.conversation.view.${key}`);
    }
  }
});
