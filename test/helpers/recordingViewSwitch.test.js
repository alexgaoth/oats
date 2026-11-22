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

// Alex, 2026-11-22: the details are the default, Hide details goes to the plain
// view, and the button there says Expand details, not Show transcript. It is a
// disclosure, so it carries chevrons, and it never picks the tab.
test("Hide details and Expand details are one disclosure with chevrons", () => {
  assert.match(
    WORKSPACE,
    /aria-expanded=\{expanded\}\s+onClick=\{\(\) => setDetail\(expanded \? "clean" : "detailed"\)\}/
  );
  assert.match(
    WORKSPACE,
    /\{expanded \? \(\s*<ChevronUp aria-hidden="true" \/>\s*\) : \(\s*<ChevronDown aria-hidden="true" \/>\s*\)\}/
  );
  assert.match(
    WORKSPACE,
    /t\(expanded \? "oats\.library\.hideDetails" : "oats\.library\.expandDetails"\)/
  );
  assert.doesNotMatch(WORKSPACE, /oats\.library\.showTranscript/);
  const locales = fs
    .readdirSync(path.join(__dirname, "../../src/locales"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(locales.length, 10);
  for (const locale of locales) {
    const library = JSON.parse(read(`src/locales/${locale}/translation.json`)).oats.library;
    assert.ok(library.expandDetails, `${locale} oats.library.expandDetails`);
    assert.ok(library.hideDetails, `${locale} oats.library.hideDetails`);
    assert.equal(library.showTranscript, undefined, locale);
  }
});

test("Questions is the first tab and the default, and the questions count opens it", () => {
  assert.match(WORKSPACE, /useState<"transcript" \| "questions">\("questions"\)/);
  const list = /<TabsList className="mb-3 shrink-0 self-start">([\s\S]*?)<\/TabsList>/.exec(
    WORKSPACE
  )[1];
  assert.ok(list.indexOf('value="questions"') > 0, "a Questions tab");
  assert.ok(
    list.indexOf('value="questions"') < list.indexOf('value="transcript"'),
    "Questions before Transcript"
  );
  assert.match(WORKSPACE, /setDetailTab\("questions"\);\s*setDetail\("detailed"\);/);
});

test("the change is one movement, and at once under reduced motion", () => {
  const css = read("src/index.css");
  assert.match(
    css,
    /\.oats-detail-reveal \{[^}]*transition:\s*height var\(--motion-base\) var\(--ease-oats\),\s*opacity var\(--motion-base\) var\(--ease-oats\);/
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.oats-detail-reveal,\s*\.oats-detail-fade\[data-state\] \{\s*transition: none;\s*\}\s*\.oats-detail-fade-in \{\s*animation: none;/
  );
  const change = read("src/components/conversation/useDetailChange.ts");
  assert.match(change, /setSettled\(prefersReducedMotion\(\) \? detailed : chosen\)/);
  // The leaving composition is drawn until the change settles.
  assert.match(WORKSPACE, /const detailed = change\.drawDetails;/);
  assert.match(WORKSPACE, /\{change\.drawClean && \(/);
});
