const test = require("node:test");
const assert = require("node:assert/strict");

let parseDbTimestamp, dbDate, conversationEndedAt, findResumableConversation, RESUME_WINDOW_MS;
let ledgerDateLong;

test.before(async () => {
  ({ parseDbTimestamp, dbDate } = await import("../../src/helpers/dbTime.mjs"));
  ({ conversationEndedAt, findResumableConversation, RESUME_WINDOW_MS } =
    await import("../../src/helpers/conversationResume.mjs"));
  ({ ledgerDateLong } = await import("../../src/helpers/ledgerDate.mjs"));
});

// Node reads `process.env.TZ` on every assignment, so one process can pin both
// directions: west of Greenwich a zone-less UTC string read as local lands in
// the future, east of it in the past.
const ZONES = ["America/Los_Angeles", "Asia/Tokyo", "UTC"];

function inZone(zone, fn) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

// What SQLite's CURRENT_TIMESTAMP writes for a moment: UTC, no "T", no "Z".
function sqliteUtc(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

const NOW = Date.UTC(2026, 9, 9, 4, 19, 35); // 21:19:35 on 8 Oct in California
const MINUTE = 60 * 1000;

function turn(at, spokenMs = 3000) {
  return { id: `s-${at}`, text: "…", timestamp: at, startMs: 0, endMs: spokenMs };
}

function note(id, { segments, createdAt, updatedAt = createdAt } = {}) {
  return {
    id,
    transcript: segments ? JSON.stringify(segments) : "[]",
    created_at: sqliteUtc(createdAt),
    updated_at: sqliteUtc(updatedAt),
  };
}

test("a SQLite timestamp is UTC in every zone", () => {
  for (const zone of ZONES) {
    inZone(zone, () => {
      assert.equal(
        parseDbTimestamp("2026-10-09 04:19:35"),
        Date.UTC(2026, 9, 9, 4, 19, 35),
        `space-separated, ${zone}`
      );
      assert.equal(
        parseDbTimestamp("2026-10-09T04:19:35"),
        Date.UTC(2026, 9, 9, 4, 19, 35),
        `T-separated without a zone, ${zone}`
      );
      assert.equal(
        parseDbTimestamp("2026-10-09 04:19"),
        Date.UTC(2026, 9, 9, 4, 19),
        `minutes only, ${zone}`
      );
    });
  }
});

test("a timestamp that carries its own zone is trusted as written", () => {
  inZone("America/Los_Angeles", () => {
    assert.equal(parseDbTimestamp("2026-10-09T04:19:35.000Z"), Date.UTC(2026, 9, 9, 4, 19, 35));
    assert.equal(parseDbTimestamp("2026-10-09T06:19:35+02:00"), Date.UTC(2026, 9, 9, 4, 19, 35));
  });
});

test("numbers and Dates pass through; nothing is guessed for junk", () => {
  assert.equal(parseDbTimestamp(NOW), NOW);
  assert.equal(parseDbTimestamp(new Date(NOW)), NOW);
  for (const junk of [null, undefined, "", "   ", "yesterday", NaN, Infinity, {}]) {
    assert.ok(Number.isNaN(parseDbTimestamp(junk)), `NaN for ${String(junk)}`);
  }
  assert.ok(Number.isNaN(dbDate("not a date").getTime()));
});

test("the record's head names the local moment, not the UTC wall clock", () => {
  inZone("America/Los_Angeles", () => {
    const head = ledgerDateLong("2026-10-09 04:19:35", { locale: "en-US" });
    assert.match(head, /Oct 8/, "the evening of the 8th in California, not the 9th");
    assert.match(head, /9:19/);
  });
  inZone("Asia/Tokyo", () => {
    const head = ledgerDateLong("2026-10-09 04:19:35", { locale: "en-US" });
    assert.match(head, /Oct 9/);
    assert.match(head, /1:19/);
  });
});

test("a conversation ends with its last word, including that turn's length", () => {
  const segments = [turn(NOW - 20 * MINUTE), turn(NOW - 6 * MINUTE, 12_000)];
  assert.equal(
    conversationEndedAt({ transcript: JSON.stringify(segments) }),
    NOW - 6 * MINUTE + 12_000
  );
});

test("a transcript with no timed turn falls back to when it was created", () => {
  for (const zone of ZONES) {
    inZone(zone, () => {
      const old = note(1, { createdAt: NOW - 5 * MINUTE });
      assert.equal(conversationEndedAt(old), NOW - 5 * MINUTE, zone);
    });
  }
});

test("a conversation that just ended is resumed, in every zone", () => {
  for (const zone of ZONES) {
    inZone(zone, () => {
      const recent = note(7, {
        segments: [turn(NOW - 9 * MINUTE)],
        createdAt: NOW - 40 * MINUTE,
        updatedAt: NOW - 5 * MINUTE,
      });
      assert.equal(findResumableConversation([recent], { now: NOW }), recent, zone);
    });
  }
});

test("a conversation that ended hours ago is never resumed, in every zone", () => {
  for (const zone of ZONES) {
    inZone(zone, () => {
      // The bug: in California this read as ending seven hours from now and
      // stayed resumable all afternoon.
      const afternoon = note(3, {
        segments: [turn(NOW - 3 * 60 * MINUTE)],
        createdAt: NOW - 4 * 60 * MINUTE,
        updatedAt: NOW - 3 * 60 * MINUTE,
      });
      assert.equal(findResumableConversation([afternoon], { now: NOW }), null, zone);
    });
  }
});

test("renaming an old conversation does not make it resumable", () => {
  const lastWeek = note(2, {
    segments: [turn(NOW - 7 * 24 * 60 * MINUTE)],
    createdAt: NOW - 7 * 24 * 60 * MINUTE,
    updatedAt: NOW - 1 * MINUTE, // renamed a moment ago
  });
  assert.equal(findResumableConversation([lastWeek], { now: NOW }), null);
});

test("an edited old conversation at the top of the list does not hide a recent one", () => {
  const edited = note(2, {
    segments: [turn(NOW - 3 * 24 * 60 * MINUTE)],
    createdAt: NOW - 3 * 24 * 60 * MINUTE,
    updatedAt: NOW - 1 * MINUTE,
  });
  const recent = note(9, {
    segments: [turn(NOW - 12 * MINUTE)],
    createdAt: NOW - 30 * MINUTE,
    updatedAt: NOW - 12 * MINUTE,
  });
  // The list is ordered by updated_at, so the edited one comes first.
  assert.equal(findResumableConversation([edited, recent], { now: NOW }), recent);
});

test("the most recently ended conversation wins", () => {
  const earlier = note(4, { segments: [turn(NOW - 25 * MINUTE)], createdAt: NOW - 50 * MINUTE });
  const later = note(5, { segments: [turn(NOW - 4 * MINUTE)], createdAt: NOW - 20 * MINUTE });
  assert.equal(findResumableConversation([earlier, later], { now: NOW }), later);
});

test("the window's edge, an empty transcript, and a last word from the future", () => {
  const atEdge = note(1, { segments: [turn(NOW - RESUME_WINDOW_MS, 0)], createdAt: NOW - 60 * MINUTE });
  assert.equal(findResumableConversation([atEdge], { now: NOW }), atEdge, "exactly at the edge");

  const past = note(2, { segments: [turn(NOW - RESUME_WINDOW_MS - 1, 0)], createdAt: NOW - 60 * MINUTE });
  assert.equal(findResumableConversation([past], { now: NOW }), null, "a millisecond past it");

  const empty = { id: 3, transcript: "", created_at: sqliteUtc(NOW - MINUTE) };
  assert.equal(findResumableConversation([empty], { now: NOW }), null, "nothing was said");

  const future = note(4, { segments: [turn(NOW + 10 * MINUTE)], createdAt: NOW });
  assert.equal(findResumableConversation([future], { now: NOW }), null, "bad clock data");

  const skew = note(5, { segments: [turn(NOW + 20_000, 0)], createdAt: NOW - MINUTE });
  assert.equal(findResumableConversation([skew], { now: NOW }), skew, "a small clock step");

  assert.equal(findResumableConversation([], { now: NOW }), null);
  assert.equal(findResumableConversation(undefined, { now: NOW }), null);
});
