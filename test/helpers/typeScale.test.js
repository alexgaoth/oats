const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// DESIGN.md §3 and §2, from the 2026-11-08 screen audit: the type scale is
// 12 / 13 / 14 / 15 / 16 / 22 / 28, and Start recording has the main action's
// depth wherever it is drawn. Measured, the shortcut keys were 11px (muted text
// on the muted fill, 4.40:1), the live clock and setup headings 24px, and the
// Home card's Start recording a flat honey button.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const KBD = read("src/components/ui/kbd.tsx");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const SETUP = read("src/components/OnboardingFlow.tsx");
const PROCESSING = read("src/components/onboarding/ProcessingStep.tsx");

test("a shortcut key is 12px muted text on the background tone", () => {
  assert.match(KBD, /\btext-xs\b/);
  assert.match(KBD, /\bbg-background\b/);
  assert.doesNotMatch(KBD, /text-\[11px\]|bg-muted\b/);
});

test("the live clock and the setup headings are on the scale", () => {
  for (const source of [WORKSPACE, SETUP, PROCESSING]) {
    assert.doesNotMatch(source, /\btext-2xl\b/);
  }
  assert.match(WORKSPACE, /<h1 className="text-\[22px\] font-semibold tabular-nums/);
});

test("every Start recording button has the main action's depth", () => {
  const starts = [
    ...WORKSPACE.matchAll(
      /<Button\b((?:=>|[^>])*?)>\s*<span aria-hidden="true" className="size-2 rounded-full bg-current" \/>\s*\{t\("oats\.conversation\.start"\)\}/g
    ),
  ];
  assert.equal(starts.length, 2, "Home's card and the empty Conversations page");
  for (const [, props] of starts) assert.match(props, /className="oats-cta"/);
});
