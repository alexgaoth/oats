const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// "Alive, not busy" (DESIGN.md §2): the frame may carry the oat world, the main
// action has depth, and nothing moves at rest. Source-level: these components
// need a browser.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const GRAIN = read("src/components/shell/SidebarGrain.tsx");
const SIDEBAR = read("src/components/shell/AppSidebar.tsx");
const CSS = read("src/index.css");

const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the sidebar's grain texture is static", () => {
  assert.doesNotMatch(
    code(GRAIN),
    /requestAnimationFrame|setInterval|setTimeout|<animate|animate-|animation|transition/
  );
  assert.match(GRAIN, /<pattern /, "drawn once as a pattern");
  assert.match(GRAIN, /pointer-events-none/, "never in the way of a click");
});

test("both sidebars, the app's and Settings', carry the grain", () => {
  assert.equal(SIDEBAR.split("<SidebarGrain />").length - 1, 2);
});

test("the page you are on is a honey pill, and only that item", () => {
  assert.match(SIDEBAR, /\? "bg-primary\/15 font-medium text-brand-ink"/);
});

test("the record button has depth only as the idle main action", () => {
  assert.match(SIDEBAR, /: "oats-cta bg-primary text-primary-foreground"/);
  const live = SIDEBAR.match(/\? "bg-recording text-recording-foreground[^"]*"/);
  assert.ok(live && !live[0].includes("oats-cta"), "live, it is plain red");
});

test("the main action sinks when pressed, but not under reduced motion", () => {
  assert.match(CSS, /\.oats-cta:active \{\s*transform: translateY\(1px\);/);
  const reduced = CSS.slice(CSS.indexOf(".oats-cta:active {"));
  assert.match(
    reduced,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.oats-cta,\s*\.oats-cta:active \{/
  );
});
