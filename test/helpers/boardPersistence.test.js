const test = require("node:test");
const assert = require("node:assert/strict");

let persistence;

test.before(async () => {
  persistence = await import("../../src/components/global/boardPersistence.ts");
});

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const force = { id: "force", type: "force", x: 0, y: 0, w: 30, h: 16 };
const arcs = { id: "arcs", type: "arcs", x: 0, y: 17, w: 30, h: 11 };

test("each tab keeps its own layout; saving one leaves the others exactly as they were", () => {
  const { withTabLayout, withoutTabLayout, EMPTY_BOARD, ALL_TAB, groupTab } = persistence;
  const work = groupTab(2);
  let state = withTabLayout(EMPTY_BOARD, ALL_TAB, [force, arcs]);
  state = withTabLayout(state, work, [{ ...force, w: 20 }]);
  assert.deepEqual(state.layouts[ALL_TAB], [force, arcs]);
  assert.equal(state.layouts[work][0].w, 20);

  const reset = withoutTabLayout(state, work);
  assert.equal(reset.layouts[work], undefined, "reset puts the tab back on its default");
  assert.deepEqual(reset.layouts[ALL_TAB], [force, arcs], "and does not touch another tab");
  assert.equal(EMPTY_BOARD.layouts[ALL_TAB], undefined, "the empty state is never written to");
});

test("a stored board comes back as it was saved", () => {
  const { migrateBoardState, BOARD_VERSION } = persistence;
  const saved = { layouts: { all: [force, arcs], "group:3": [arcs] } };
  const restored = migrateBoardState(JSON.parse(JSON.stringify(saved)), BOARD_VERSION);
  assert.deepEqual(restored, saved);
});

test("a damaged tab is cleaned, not allowed to cost the other tabs their layout", () => {
  const { migrateBoardState } = persistence;
  const restored = migrateBoardState(
    {
      layouts: {
        all: [
          force,
          { id: "x", type: "radar", x: 0, y: 0, w: 10, h: 10 },
          { ...arcs, x: "left" },
          { ...force, x: 40 },
          null,
        ],
        "group:1": "not a layout",
        "group:2": [],
        "group:3": [{ ...arcs, w: 1, h: 1, x: 2.4, y: -3 }],
      },
    },
    1
  );
  assert.deepEqual(
    restored.layouts.all,
    [force],
    "unknown types, broken positions and repeats are dropped"
  );
  assert.equal(restored.layouts["group:1"], undefined);
  assert.deepEqual(restored.layouts["group:2"], [], "a board somebody cleared stays cleared");
  assert.deepEqual(
    restored.layouts["group:3"][0],
    { id: "arcs", type: "arcs", x: 2, y: 0, w: 14, h: 9 },
    "sizes are held to the minimum and positions to the grid"
  );
});

test("anything unrecognisable becomes an empty board, never an exception", () => {
  const { migrateBoardState } = persistence;
  for (const junk of [null, undefined, 3, "x", [], { layouts: [] }, { layouts: null }]) {
    assert.deepEqual(migrateBoardState(junk, 0), { layouts: {} });
  }
});

test("the old map's hand-made arrangement moves to the All tab's force graph", () => {
  const { migrateLegacyMapLayout, LEGACY_MAP_LAYOUT_KEY, forceLayoutKey, ALL_TAB } = persistence;
  const arrangement = JSON.stringify({ 4: { x: 0.2, y: 0.4 }, 9: { x: 0.7, y: 0.5 } });
  const storage = memoryStorage({ [LEGACY_MAP_LAYOUT_KEY]: arrangement });
  assert.equal(migrateLegacyMapLayout(storage), true);
  assert.equal(storage.getItem(forceLayoutKey(ALL_TAB)), arrangement);
  assert.equal(storage.getItem(LEGACY_MAP_LAYOUT_KEY), null, "and runs once");
  assert.equal(migrateLegacyMapLayout(storage), false);
  assert.equal(storage.getItem(forceLayoutKey(ALL_TAB)), arrangement);
});

test("the migration never overwrites an arrangement the All tab already has", () => {
  const { migrateLegacyMapLayout, LEGACY_MAP_LAYOUT_KEY, forceLayoutKey, ALL_TAB } = persistence;
  const current = JSON.stringify({ 1: { x: 0.5, y: 0.5 } });
  const storage = memoryStorage({
    [LEGACY_MAP_LAYOUT_KEY]: JSON.stringify({ 1: { x: 0.1, y: 0.1 } }),
    [forceLayoutKey(ALL_TAB)]: current,
  });
  assert.equal(migrateLegacyMapLayout(storage), false);
  assert.equal(storage.getItem(forceLayoutKey(ALL_TAB)), current);
  assert.equal(storage.getItem(LEGACY_MAP_LAYOUT_KEY), null);
});

test("a damaged old arrangement is dropped, and storage that throws is survived", () => {
  const { migrateLegacyMapLayout, LEGACY_MAP_LAYOUT_KEY, forceLayoutKey, ALL_TAB } = persistence;
  const storage = memoryStorage({ [LEGACY_MAP_LAYOUT_KEY]: "{not json" });
  assert.equal(migrateLegacyMapLayout(storage), false);
  assert.equal(storage.getItem(forceLayoutKey(ALL_TAB)), null);
  assert.equal(storage.getItem(LEGACY_MAP_LAYOUT_KEY), null);

  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.equal(migrateLegacyMapLayout(throwing), false);
});
