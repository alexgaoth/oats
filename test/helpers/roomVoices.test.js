const test = require("node:test");
const assert = require("node:assert/strict");

let groupVoices, symmetricEigen, ROOM_VOICES;

test.before(async () => {
  ({ groupVoices, symmetricEigen, ROOM_VOICES } = await import("../../src/helpers/roomVoices.mjs"));
});

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function gaussian(rand) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
}

/** A voice: a direction in 32 dimensions. A line of it: that direction plus noise. */
function voice(rand) {
  return Array.from({ length: 32 }, () => gaussian(rand));
}

function lineOf(centre, rand, noise = 0.35) {
  const norm = Math.hypot(...centre);
  return Float32Array.from(centre, (v) => v / norm + noise * (gaussian(rand) / Math.sqrt(32)));
}

/** A conversation: `who[i]` speaks line i, 3 s a line with 0.5 s between. */
function conversation(who, voices, rand, durationMs = 3000) {
  return who.map((v, i) => ({
    startMs: i * (durationMs + 500),
    endMs: i * (durationMs + 500) + durationMs,
    embedding: lineOf(voices[v], rand),
    truth: v,
  }));
}

/** Whether the turns put every line on its own voice, under one renaming. */
function sameGrouping(lines, turns) {
  const byStart = new Map(turns.map((t) => [Math.round(t.start * 1000), t.speaker]));
  const seen = new Map();
  for (const l of lines) {
    const label = byStart.get(l.startMs);
    if (!label) return false;
    if (seen.has(l.truth) && seen.get(l.truth) !== label) return false;
    seen.set(l.truth, label);
  }
  return new Set(seen.values()).size === seen.size;
}

test("the eigendecomposition gives each eigenvalue, ascending, with an orthonormal eigenvector", () => {
  const rand = seeded(7);
  const n = 7;
  const a = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) a[i][j] = a[j][i] = gaussian(rand);
  }
  const { values, vectors } = symmetricEigen(a);
  for (let k = 1; k < n; k++) assert.ok(values[k] >= values[k - 1]);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      let av = 0;
      for (let j = 0; j < n; j++) av += a[i][j] * vectors[j][k];
      assert.ok(Math.abs(av - values[k] * vectors[i][k]) < 1e-9);
    }
    for (let m = 0; m < n; m++) {
      let d = 0;
      for (let i = 0; i < n; i++) d += vectors[i][k] * vectors[i][m];
      assert.ok(Math.abs(d - (k === m ? 1 : 0)) < 1e-9);
    }
  }
});

test("two voices are two people, every line on its own, numbered by who spoke first", () => {
  const rand = seeded(1);
  const voices = [voice(rand), voice(rand)];
  const who = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 1 : 0));
  const lines = conversation(who, voices, rand);
  const turns = groupVoices(lines);
  assert.equal(turns.length, lines.length);
  assert.ok(sameGrouping(lines, turns));
  assert.equal(turns[0].speaker, "speaker_00");
  assert.equal(new Set(turns.map((t) => t.speaker)).size, 2);
  // Line 0 is voice 1, the first to speak; line 1 is voice 0, the second.
  assert.deepEqual(turns[1], { start: 3.5, end: 6.5, speaker: "speaker_01" });
});

test("three voices are three people", () => {
  const rand = seeded(2);
  const voices = [voice(rand), voice(rand), voice(rand)];
  const who = Array.from({ length: 45 }, (_, i) => i % 3);
  const lines = conversation(who, voices, rand);
  const turns = groupVoices(lines);
  assert.ok(sameGrouping(lines, turns));
  assert.equal(new Set(turns.map((t) => t.speaker)).size, 3);
});

test("one voice stays one person: the two halves a forced split finds are alike, and join", () => {
  const rand = seeded(3);
  const lines = conversation(new Array(30).fill(0), [voice(rand)], rand);
  const turns = groupVoices(lines);
  assert.equal(turns.length, 30);
  assert.equal(new Set(turns.map((t) => t.speaker)).size, 1);
});

test("a group with under 5% of the speech joins the nearest bigger one", () => {
  const rand = seeded(4);
  const voices = [voice(rand), voice(rand), voice(rand)];
  // 40 lines of two people, and one stray line of a third voice.
  const who = Array.from({ length: 40 }, (_, i) => i % 2);
  who.splice(20, 0, 2);
  const lines = conversation(who, voices, rand);
  const turns = groupVoices(lines);
  assert.equal(new Set(turns.map((t) => t.speaker)).size, 2);
});

test("short lines join the nearest group; lines with no voice get no turn", () => {
  const rand = seeded(5);
  const voices = [voice(rand), voice(rand)];
  const lines = conversation(
    Array.from({ length: 20 }, (_, i) => i % 2),
    voices,
    rand
  );
  const short = { startMs: 100_000, endMs: 100_700, embedding: lineOf(voices[1], rand), truth: 1 };
  const tooShort = { startMs: 101_000, endMs: 101_300, embedding: lineOf(voices[0], rand) };
  const silent = { startMs: 102_000, endMs: 105_000, embedding: null };
  const turns = groupVoices([...lines, short, tooShort, silent]);
  assert.equal(turns.length, 21);
  const label = (startMs) => turns.find((t) => Math.round(t.start * 1000) === startMs)?.speaker;
  assert.equal(label(short.startMs), label(lines[1].startMs));
  assert.equal(label(tooShort.startMs), undefined);
  assert.equal(label(silent.startMs), undefined);
});

test("no conversation to divide: fewer than four lines long enough to group", () => {
  const rand = seeded(6);
  const voices = [voice(rand), voice(rand)];
  assert.deepEqual(groupVoices(conversation([0, 1, 0], voices, rand)), []);
  assert.deepEqual(groupVoices(conversation([0, 1, 0, 1, 0], voices, rand, 800)), []);
  assert.deepEqual(groupVoices([]), []);
  assert.deepEqual(groupVoices(null), []);
});

test("the same conversation always groups the same way", () => {
  const rand = seeded(8);
  const voices = [voice(rand), voice(rand)];
  const lines = conversation(
    Array.from({ length: 30 }, (_, i) => (i * 7) % 2),
    voices,
    rand
  );
  assert.deepEqual(groupVoices(lines), groupVoices(lines));
});

test("over the cap, the longest lines are grouped and the rest join them", () => {
  const rand = seeded(9);
  const voices = [voice(rand), voice(rand)];
  const lines = conversation(
    Array.from({ length: 30 }, (_, i) => i % 2),
    voices,
    rand
  );
  const turns = groupVoices(lines, { MAX_CLUSTER_LINES: 12 });
  assert.equal(turns.length, 30);
  assert.ok(sameGrouping(lines, turns));
  assert.equal(ROOM_VOICES.MAX_CLUSTER_LINES, 600);
});
