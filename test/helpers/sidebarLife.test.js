const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// "Alive, not busy" (DESIGN.md §2): the frame may carry the oat world, the main
// action has depth, and nothing moves at rest. Source-level: these components
// need a browser.

const file = (name) => path.join(__dirname, "../..", name);
const read = (name) => fs.readFileSync(file(name), "utf8");
const SIDEBAR = read("src/components/shell/AppSidebar.tsx");
const CSS = read("src/index.css");

// The scattered oat grains behind both sidebars were taken out (Alex,
// 2026-10-12): the field at the foot is the sidebar's one piece of the oat
// world, and the grains showed through its sky.
test("the sidebar has no texture of scattered grains", () => {
  assert.equal(fs.existsSync(file("src/components/shell/SidebarGrain.tsx")), false);
  assert.doesNotMatch(SIDEBAR, /SidebarGrain|<pattern|-z-10/);
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
