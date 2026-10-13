// The Activity widget's calendar: the last twelve weeks, one cell per day, a
// column per week and a row per weekday, with today in the last column.
//
// Days are the reader's local days, counted by calendar arithmetic rather than
// by adding 24 hours, so a change to or from summer time never puts two
// conversations of one evening on different days. Pure, so that is tested.

export const WEEKS = 12;

export interface CalendarDay {
  /** The local day, `YYYY-MM-DD`. */
  key: string;
  /** Midnight at the start of the day, local, epoch ms. */
  start: number;
  column: number;
  row: number;
  /** The conversations of that day, oldest first. */
  ids: number[];
  today: boolean;
  /** After today: drawn as nothing. */
  future: boolean;
}

export interface ActivityCalendar {
  days: CalendarDay[];
  /** The days that have conversations, by key. */
  byDay: Map<string, number[]>;
  /** Where each month begins, for the labels along the top. */
  months: { column: number; start: number }[];
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The local day a moment falls on, `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Every conversation by its local day, oldest first within a day. */
export function conversationsByDay(
  conversations: { id: number; createdAt: number }[]
): Map<string, number[]> {
  const byDay = new Map<string, number[]>();
  const sorted = [...conversations].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  for (const conversation of sorted) {
    const key = dayKey(conversation.createdAt);
    const list = byDay.get(key);
    if (list) list.push(conversation.id);
    else byDay.set(key, [conversation.id]);
  }
  return byDay;
}

/**
 * How dense a day's dither is: a quarter of ink per conversation, full at
 * four or more. An empty day has none.
 */
export function densityFor(count: number): number {
  return Math.max(0, Math.min(1, count / 4));
}

/**
 * The calendar for `conversations` as of `now`. `firstDay` is the weekday the
 * reader's weeks start on, as `Intl.Locale`'s week info gives it: 1 is Monday,
 * 7 is Sunday.
 */
export function activityCalendar(
  conversations: { id: number; createdAt: number }[],
  {
    now = Date.now(),
    weeks = WEEKS,
    firstDay = 1,
  }: { now?: number; weeks?: number; firstDay?: number } = {}
): ActivityCalendar {
  const today = new Date(now);
  const first = firstDay % 7; // in getDay()'s terms: 0 is Sunday
  const intoWeek = (today.getDay() - first + 7) % 7;
  const origin = new Date(today.getFullYear(), today.getMonth(), today.getDate() - intoWeek);
  origin.setDate(origin.getDate() - (weeks - 1) * 7);
  const todayKey = dayKey(now);

  const byDay = conversationsByDay(conversations);

  const days: CalendarDay[] = [];
  const months: { column: number; start: number }[] = [];
  let passedToday = false;
  for (let column = 0; column < weeks; column += 1) {
    for (let row = 0; row < 7; row += 1) {
      const date = new Date(
        origin.getFullYear(),
        origin.getMonth(),
        origin.getDate() + column * 7 + row
      );
      const key = dayKey(date.getTime());
      const isToday = key === todayKey;
      days.push({
        key,
        start: date.getTime(),
        column,
        row,
        ids: byDay.get(key) ?? [],
        today: isToday,
        future: passedToday,
      });
      if (isToday) passedToday = true;
    }
    // A month is named at the first week that starts in it, as a wall
    // calendar's columns are read; a month that starts mid-week is named at
    // the next week.
    const start = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + column * 7);
    const previous = months[months.length - 1];
    if (!previous || new Date(previous.start).getMonth() !== start.getMonth()) {
      months.push({ column, start: new Date(start.getFullYear(), start.getMonth(), 1).getTime() });
    }
  }
  // Two names in neighbouring columns would run into each other: the first
  // week's gives way to the month that starts next to it.
  if (months.length > 1 && months[1].column - months[0].column < 2) months.shift();

  const shown = new Set(days.map((day) => day.key));
  for (const key of [...byDay.keys()]) if (!shown.has(key)) byDay.delete(key);
  return { days, byDay, months };
}

/** The weekday the reader's weeks start on (1 Monday ... 7 Sunday), Monday when unknown. */
export function firstDayOfWeek(locale: string | undefined): number {
  try {
    const intl = new Intl.Locale(locale ?? "en") as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = intl.getWeekInfo?.() ?? intl.weekInfo;
    return info?.firstDay ?? 1;
  } catch {
    return 1;
  }
}
