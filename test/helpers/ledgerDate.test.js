const test = require("node:test");
const assert = require("node:assert/strict");

let ledgerDate, ledgerDateKind, ledgerDayGroup, ledgerTime, conversationSpanMs, formatSpan;

test.before(async () => {
  ({ ledgerDate, ledgerDateKind, ledgerDayGroup, ledgerTime, conversationSpanMs, formatSpan } =
    await import("../../src/helpers/ledgerDate.mjs"));
});

// Saturday 3 October 2026, 14:00 local.
const NOW = new Date(2026, 9, 3, 14, 0);

test("precision follows distance: a time today, a weekday this week, a date this year", () => {
  assert.equal(ledgerDateKind(new Date(2026, 9, 3, 0, 1), NOW), "time");
  assert.equal(
    ledgerDateKind(new Date(2026, 9, 2, 23, 59), NOW),
    "weekday",
    "yesterday is a day, not a time"
  );
  assert.equal(ledgerDateKind(new Date(2026, 8, 27, 9, 0), NOW), "weekday", "six days back");
  assert.equal(
    ledgerDateKind(new Date(2026, 8, 26, 9, 0), NOW),
    "date",
    "seven days back repeats today's weekday"
  );
  assert.equal(ledgerDateKind(new Date(2026, 0, 1), NOW), "date");
  assert.equal(ledgerDateKind(new Date(2025, 11, 31), NOW), "dateYear");
});

// A clock that has run backwards must not print a weekday for a day that has
// not happened.
test("a moment in the future is named by its date", () => {
  assert.equal(ledgerDateKind(new Date(2026, 9, 5), NOW), "date");
});

test("two conversations on the same day read differently", () => {
  const morning = ledgerDate(new Date(2026, 9, 3, 9, 15), { now: NOW, locale: "en-GB" });
  const noon = ledgerDate(new Date(2026, 9, 3, 12, 40), { now: NOW, locale: "en-GB" });
  assert.notEqual(morning, noon);
  assert.match(morning, /9:15/);
});

test("an invalid date prints nothing rather than 'Invalid Date'", () => {
  assert.equal(ledgerDate("not a date", { now: NOW }), "");
});

test("a span runs first utterance to last, and is unknown without timings", () => {
  assert.equal(
    conversationSpanMs([{ timestamp: 1000 }, { timestamp: 181000 }, { timestamp: 61000 }]),
    180000
  );
  assert.equal(conversationSpanMs([{ text: "imported" }]), null);
  assert.equal(conversationSpanMs([{ timestamp: 5 }]), null);
  assert.equal(conversationSpanMs(null), null);
});

test("a span is whole minutes, at least one, and hours past sixty", () => {
  assert.match(formatSpan(20_000, { locale: "en" }), /^1\b/);
  assert.match(formatSpan(3 * 60_000, { locale: "en" }), /^3\b/);
  assert.match(formatSpan(83 * 60_000, { locale: "en" }), /1.*23/);
  assert.equal(formatSpan(0), "");
  assert.equal(formatSpan(Number.NaN), "");
});

test("a list groups by local day: today and yesterday by name, then weekday, then date", () => {
  const names = { now: NOW, locale: "en-US", today: "Today", yesterday: "Yesterday" };
  assert.equal(ledgerDayGroup(new Date(2026, 9, 3, 0, 1), names).label, "Today");
  assert.equal(ledgerDayGroup(new Date(2026, 9, 2, 23, 59), names).label, "Yesterday");
  assert.equal(ledgerDayGroup(new Date(2026, 8, 27, 9, 0), names).label, "Sunday", "six days back");
  assert.equal(
    ledgerDayGroup(new Date(2026, 8, 26, 9, 0), names).label,
    "Sat, Sep 26",
    "seven days back repeats today's weekday, so it is a date"
  );
  assert.equal(ledgerDayGroup(new Date(2025, 11, 31), names).label, "Dec 31, 2025");
});

test("every moment of one local day shares a group key, and the next day does not", () => {
  const morning = ledgerDayGroup(new Date(2026, 9, 3, 0, 0), { now: NOW });
  const night = ledgerDayGroup(new Date(2026, 9, 3, 23, 59), { now: NOW });
  const next = ledgerDayGroup(new Date(2026, 9, 2, 23, 59), { now: NOW });
  assert.equal(morning.key, night.key);
  assert.notEqual(morning.key, next.key);
});

test("a stored UTC timestamp is grouped by the reader's local day", () => {
  const stored = "2026-10-03 13:00:00";
  const local = new Date(Date.UTC(2026, 9, 3, 13, 0, 0));
  assert.equal(ledgerDayGroup(stored, { now: NOW }).key, ledgerDayGroup(local, { now: NOW }).key);
  assert.equal(ledgerTime(stored, { locale: "en-GB" }), ledgerTime(local, { locale: "en-GB" }));
});

test("an unreadable moment has no group and no time rather than a wrong one", () => {
  assert.deepEqual(ledgerDayGroup("not a date", { now: NOW }), { key: "", label: "" });
  assert.equal(ledgerTime("not a date"), "");
});
