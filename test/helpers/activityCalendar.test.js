// Days are the reader's local days. Pinned to a zone with summer time, so the
// test means the same wherever it runs, and so it crosses a change of clocks.
process.env.TZ = "America/New_York";

const test = require("node:test");
const assert = require("node:assert/strict");

let calendar;

test.before(async () => {
  calendar = await import("../../src/components/global/activityCalendar.ts");
});

const at = (year, month, day, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

test("twelve weeks of days, a column a week, today in the last column", () => {
  const { activityCalendar, WEEKS } = calendar;
  // Tuesday 13 October 2026, weeks starting on Monday.
  const { days } = activityCalendar([], { now: at(2026, 10, 13), firstDay: 1 });
  assert.equal(WEEKS, 12);
  assert.equal(days.length, 84);
  const today = days.find((day) => day.today);
  assert.equal(today.key, "2026-10-13");
  assert.equal(today.column, 11);
  assert.equal(today.row, 1, "Tuesday is the second row of a week that starts on Monday");
  assert.equal(days[0].key, "2026-07-27", "eleven whole weeks before this one");
  assert.deepEqual(
    days.filter((day) => day.future).map((day) => day.key),
    ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]
  );
});

test("weeks start on the reader's first day", () => {
  const { activityCalendar } = calendar;
  const sunday = activityCalendar([], { now: at(2026, 10, 13), firstDay: 7 });
  assert.equal(sunday.days[0].key, "2026-07-26");
  assert.equal(sunday.days.find((day) => day.today).row, 2, "Tuesday is the third row from Sunday");
});

test("a change of clocks neither repeats a day nor skips one", () => {
  const { activityCalendar } = calendar;
  // Summer time ends in New York on 1 November 2026.
  const { days } = activityCalendar([], { now: at(2026, 11, 20), firstDay: 1 });
  const keys = days.map((day) => day.key);
  assert.equal(new Set(keys).size, 84);
  for (let index = 1; index < days.length; index += 1) {
    const step = Math.round((days[index].start - days[index - 1].start) / 3600000);
    assert.ok(
      step === 24 || step === 25 || step === 23,
      `${keys[index]} follows ${keys[index - 1]}`
    );
  }
  assert.ok(keys.includes("2026-11-01") && keys.includes("2026-11-02"));
});

test("a conversation counts on its local day, late evening and early morning apart", () => {
  const { activityCalendar, dayKey } = calendar;
  const conversations = [
    { id: 1, createdAt: at(2026, 10, 12, 23, 40) },
    { id: 2, createdAt: at(2026, 10, 13, 0, 20) },
    { id: 3, createdAt: at(2026, 10, 12, 9, 0) },
    // Outside the twelve weeks: not on the calendar.
    { id: 4, createdAt: at(2026, 3, 1) },
  ];
  const { days, byDay } = activityCalendar(conversations, {
    now: at(2026, 10, 13, 18),
    firstDay: 1,
  });
  assert.deepEqual(days.find((day) => day.key === "2026-10-12").ids, [3, 1], "oldest first");
  assert.deepEqual(days.find((day) => day.key === "2026-10-13").ids, [2]);
  assert.equal(byDay.has(dayKey(at(2026, 3, 1))), false);
});

test("every month in view is named once, at the first week that starts in it", () => {
  const { activityCalendar } = calendar;
  const { months } = activityCalendar([], { now: at(2026, 10, 13), firstDay: 7 });
  const names = months.map((month) => new Date(month.start).getMonth() + 1);
  // 26 July to 17 October: August, September and October; July's one week
  // gives way to August, which starts the next column.
  assert.deepEqual(names, [8, 9, 10]);
  for (let index = 1; index < months.length; index += 1) {
    assert.ok(months[index].column - months[index - 1].column >= 2, "names never touch");
  }
});

test("a day's dither is a quarter of ink per conversation, full at four", () => {
  const { densityFor } = calendar;
  assert.equal(densityFor(0), 0);
  assert.equal(densityFor(1), 0.25);
  assert.equal(densityFor(2), 0.5);
  assert.equal(densityFor(4), 1);
  assert.equal(densityFor(9), 1);
});

test("conversations are grouped by local day for pointing at a day", () => {
  const { conversationsByDay } = calendar;
  const byDay = conversationsByDay([
    { id: 7, createdAt: at(2026, 10, 1, 9) },
    { id: 5, createdAt: at(2026, 10, 1, 8) },
    { id: 6, createdAt: at(2026, 10, 2, 8) },
  ]);
  assert.deepEqual(byDay.get("2026-10-01"), [5, 7]);
  assert.deepEqual(byDay.get("2026-10-02"), [6]);
});
