// When a conversation happened, written the way a ledger is read.
//
// Every surface used `toLocaleDateString()`, which prints `10/3/2026` for every
// conversation of the day — two meetings an hour apart were indistinguishable
// in the list, and nothing anywhere said how long one ran. A record of
// conversations is scanned by *when*, and "today, 10:47, for 40 minutes" is the
// bearing a reader actually uses.
//
// The precision follows the distance, as a mail client's does: a time for
// today, a weekday and a time within the week, a day and month within the year,
// and the year only once it differs. Every string comes from `Intl` in the
// interface's own language, so this needs no translation keys and cannot ship
// a month name in English to a German reader.
//
// Pure and DOM-free so the bucket boundaries can be pinned.

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDaysBetween(earlier, later) {
  const a = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * How precisely to name a moment, relative to now.
 *
 * @returns {"time" | "weekday" | "date" | "dateYear"}
 */
export function ledgerDateKind(when, now = new Date()) {
  const date = when instanceof Date ? when : new Date(when);
  const days = calendarDaysBetween(date, now);
  if (days === 0) return "time";
  // Six days back still names a distinct weekday; seven would repeat today's.
  if (days > 0 && days < 7) return "weekday";
  if (date.getFullYear() === now.getFullYear()) return "date";
  return "dateYear";
}

const FORMATS = {
  time: { hour: "numeric", minute: "2-digit" },
  weekday: { weekday: "short", hour: "numeric", minute: "2-digit" },
  date: { day: "numeric", month: "short" },
  dateYear: { day: "numeric", month: "short", year: "numeric" },
};

/**
 * The moment, as briefly as its distance allows. Empty for an invalid date.
 *
 * @param {Date | string | number} when
 * @param {{ now?: Date, locale?: string }} [options]
 */
export function ledgerDate(when, { now = new Date(), locale } = {}) {
  const date = when instanceof Date ? when : new Date(when);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, FORMATS[ledgerDateKind(date, now)]).format(date);
}

/**
 * The moment in full, for the head of a record: weekday, date, and time.
 *
 * @param {Date | string | number} when
 * @param {{ locale?: string }} [options]
 */
export function ledgerDateLong(when, { locale } = {}) {
  const date = when instanceof Date ? when : new Date(when);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * How long a conversation ran, from its first utterance to its last.
 *
 * Null when it cannot be known — no segments, no timings — rather than a guess:
 * a duration on a record is a claim, and "0 min" for an imported transcript
 * would be a false one.
 */
export function conversationSpanMs(segments) {
  if (!Array.isArray(segments)) return null;
  let first = Infinity;
  let last = -Infinity;
  for (const segment of segments) {
    const at = segment?.timestamp;
    if (!Number.isFinite(at)) continue;
    if (at < first) first = at;
    if (at > last) last = at;
  }
  return Number.isFinite(first) && last > first ? last - first : null;
}

/**
 * A span in whole minutes, through `Intl` ("3 min", "1 Std., 23 Min.",
 * "1 時間 23 分"). Anything under a minute reads as one: the shortest
 * conversation worth a record is not usefully "0 min".
 *
 * @param {number | null} ms
 * @param {{ locale?: string }} [options]
 */
export function formatSpan(ms, { locale } = {}) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const total = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (typeof Intl.DurationFormat === "function") {
    return new Intl.DurationFormat(locale, { style: "short" }).format(
      hours ? (minutes ? { hours, minutes } : { hours }) : { minutes }
    );
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  }).format(total);
}
