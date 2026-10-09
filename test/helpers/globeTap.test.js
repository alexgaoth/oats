const test = require("node:test");
const assert = require("node:assert/strict");
const { createGlobeTap, MAX_TAP_MS } = require("../../src/helpers/globeTap");

function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("a quick, solitary press of Fn is a tap", () => {
  const c = clock();
  const tap = createGlobeTap({ now: c.now });
  tap.down();
  c.advance(120);
  assert.equal(tap.up(), true);
});

test("Fn used as a modifier is not a tap: Fn+Delete, Fn+arrows, Fn+F-keys", () => {
  const c = clock();
  const tap = createGlobeTap({ now: c.now });
  tap.down();
  c.advance(80);
  tap.interrupted();
  c.advance(40);
  assert.equal(tap.up(), false);
});

test("holding 🌐 for the input-source or emoji picker is not a tap", () => {
  const c = clock();
  const tap = createGlobeTap({ now: c.now });
  tap.down();
  c.advance(MAX_TAP_MS + 1);
  assert.equal(tap.up(), false);
});

test("a release with no press, and a press after an interrupted one, behave", () => {
  const c = clock();
  const tap = createGlobeTap({ now: c.now });
  assert.equal(tap.up(), false, "a stray release toggles nothing");
  tap.down();
  tap.interrupted();
  tap.up();
  // The interruption belongs to the press it happened in.
  tap.down();
  c.advance(100);
  assert.equal(tap.up(), true);
});
