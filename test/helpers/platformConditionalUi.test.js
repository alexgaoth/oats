const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The app is developed on Linux and will mostly be run on macOS. Anything whose
// correctness depends on which of those it is running on has to be checkable
// from either one, or it is only ever verified on the platform nobody uses.
//
// These are source-level assertions. The behaviours below live in CSS and in
// native window chrome, neither of which can be exercised in a node test, so what
// is pinned here is the *decision* — if someone deletes the platform gate, this
// fails and they have to argue with the comment explaining why it exists.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const CSS = read("src/index.css");
const ENTRY = read("src/main.jsx");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const WINDOW_CONFIG = read("src/helpers/windowConfig.js");
const FORCE_GRAPH = read("src/components/notes/ForceGraph.tsx");

/**
 * Load `platform.ts` fresh with a faked environment and run the attribute writer.
 *
 * The module caches the resolved platform, so each case needs its own instance —
 * hence the cache-busting query. This is what actually exercises the macOS branch
 * on a Linux machine; asserting that the source *contains* the right string would
 * pass just as happily if `getPlatform()` started returning the wrong answer.
 */
async function applyWith({ electronPlatform, userAgent }) {
  const documentElement = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
  };
  globalThis.document = { documentElement };
  globalThis.window = electronPlatform
    ? { electronAPI: { getPlatform: () => electronPlatform } }
    : {};
  if (userAgent) {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent },
      configurable: true,
      writable: true,
    });
  }
  try {
    const seed = `${electronPlatform ?? "none"}-${userAgent ?? "none"}`;
    const mod = await import(`../../src/utils/platform.ts?case=${encodeURIComponent(seed)}`);
    mod.applyPlatformAttribute();
    return documentElement.attributes["data-platform"];
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    if (userAgent) {
      Object.defineProperty(globalThis, "navigator", {
        value: previous.navigator,
        configurable: true,
        writable: true,
      });
    }
  }
}

test("the macOS branch is exercised on this machine, not just described", async () => {
  // The scrollbar fix is entirely conditional on this attribute being "darwin"
  // when the app runs on a Mac, and this is the only place that can be checked
  // from Linux.
  assert.equal(await applyWith({ electronPlatform: "darwin" }), "darwin");
  assert.equal(await applyWith({ electronPlatform: "linux" }), "linux");
  assert.equal(await applyWith({ electronPlatform: "win32" }), "win32");

  // Pairing darwin with a Linux user agent is what makes the darwin branch
  // load-bearing. `getPlatform()`'s *default* return is already "darwin", so
  // asserting darwin on a machine that would fall back to darwin anyway proves
  // nothing — deleting the darwin case from platform.ts would leave it green.
  assert.equal(
    await applyWith({
      electronPlatform: "darwin",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    }),
    "darwin",
    "the Electron-reported platform must win over the user agent"
  );
});

test("the platform falls back to the user agent when Electron is not there", async () => {
  assert.equal(
    await applyWith({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }),
    "darwin"
  );
  assert.equal(await applyWith({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }), "linux");
});

test("the platform is published to CSS before React mounts", () => {
  assert.match(ENTRY, /applyPlatformAttribute\(\)/, "the renderer entry must call it");

  // Ordering matters: a rule that applies for one frame and then stops is a
  // visible flash, not a subtlety.
  const applied = ENTRY.indexOf("applyPlatformAttribute()");
  const mounted = ENTRY.indexOf("createRoot");
  assert.ok(applied > -1 && mounted > -1, "expected both calls in the entry point");
  assert.ok(applied < mounted, "the attribute must be set before React mounts");
});

test("macOS keeps its overlay scrollbars", () => {
  // Styling ::-webkit-scrollbar with a width opts the element out of macOS
  // overlay scrollbars and gives it a classic gutter that takes layout space.
  // Every scrollbar rule must therefore be gated to non-macOS.
  // Selector lines only — a prose comment mentioning the pseudo-element is not a
  // rule, and matching it would make this test pass or fail on the wording.
  const rules = CSS.split("\n").filter(
    (line) => line.includes("::-webkit-scrollbar") && line.trimEnd().endsWith("{")
  );
  assert.ok(rules.length > 0, "expected scrollbar rules to exist at all");

  for (const rule of rules) {
    // `.agent-chat-scroll` is the agent overlay, a separate always-scrolling
    // surface where a visible track is intentional.
    if (rule.includes(".agent-chat-scroll")) continue;
    assert.match(
      rule,
      /html:not\(\[data-platform="darwin"\]\)/,
      `scrollbar rule must be gated away from macOS: ${rule.trim()}`
    );
  }
});

test("the frameless window has a drag region on every platform, not just Linux", () => {
  // `titleBarStyle: "hiddenInset"` gives macOS its traffic lights but not a
  // draggable title bar, and `frame: false` applies everywhere.
  assert.match(WINDOW_CONFIG, /frame: false/, "the control panel is frameless");
  assert.match(
    WORKSPACE,
    /WebkitAppRegion: "drag"/,
    "the workspace must provide its own drag region"
  );
});

test("the drag region occupies layout rather than floating over the surfaces", () => {
  // `-webkit-app-region: drag` swallows clicks. Floating it over a scroll
  // container makes every row that scrolls under it unclickable.
  const index = WORKSPACE.indexOf('WebkitAppRegion: "drag"');
  assert.ok(index > -1, "drag region not found");
  const element = WORKSPACE.slice(Math.max(0, index - 400), index);
  assert.doesNotMatch(
    element,
    /className="[^"]*\babsolute\b[^"]*"/,
    "the drag region must not be absolutely positioned over the content"
  );
  assert.match(element, /className="[^"]*\bshrink-0\b[^"]*"/, "it must hold its own height");
});

test("macOS traffic lights have the band to themselves", () => {
  const position = WINDOW_CONFIG.match(/trafficLightPosition: \{ x: (\d+), y: (\d+) \}/);
  assert.ok(position, "expected an explicit traffic light position");
  const y = Number(position[2]);
  // A traffic light button is 14px tall, so the group ends at y + 14.
  const bottom = y + 14;

  // Match the height inside the band's class list rather than pinning the whole
  // string: the band legitimately gained layout classes when the orientation nav
  // moved onto it, and this test is about the traffic lights, not about which
  // other utilities happen to sit beside `h-9`.
  const band = WORKSPACE.match(/className="([^"]*\bz-20\b[^"]*\bshrink-0\b[^"]*)"/);
  assert.ok(band, "expected to find the drag band's class list");
  const height = band[1].match(/\bh-(\d+)\b/);
  assert.ok(height, "expected the drag band to declare a Tailwind height");
  const bandPx = Number(height[1]) * 4;

  assert.ok(
    bandPx >= bottom,
    `the drag band (${bandPx}px) must cover the traffic lights (to ${bottom}px), ` +
      "or macOS draws them on top of the first line of content"
  );
});

test("canvas text uses the same mono token as the DOM", () => {
  // Canvas does not inherit CSS. A hard-coded stack here resolves to SF Mono on
  // macOS and to something else everywhere else, so the divergence is invisible
  // on the platform this mostly ships to.
  assert.match(
    FORCE_GRAPH,
    /getPropertyValue\("--font-family-mono"\)/,
    "graph labels should read the app's mono token"
  );
  assert.doesNotMatch(
    FORCE_GRAPH,
    /ctx\.font = ['"`]\d+px ui-monospace/,
    "graph labels should not hard-code a font stack"
  );
});

test("canvas backing stores are clamped, so a Retina Mac is not 4x the work", () => {
  for (const [name, source] of [
    ["ForceGraph", FORCE_GRAPH],
    ["ConversationContour", read("src/components/conversation/ConversationContour.tsx")],
  ]) {
    assert.match(
      source,
      /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/,
      `${name} must clamp devicePixelRatio`
    );
  }
});
