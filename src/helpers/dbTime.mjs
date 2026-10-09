// When the database says something happened.
//
// SQLite's `CURRENT_TIMESTAMP` and `datetime('now')` write UTC as
// "2026-10-08 21:19:35": no "T", no "Z". JavaScript reads a date-time without a
// zone as *local* time, so every stored moment came back shifted by the
// machine's offset — hours in the future west of Greenwich, hours in the past
// east of it. In California a conversation that ended five minutes ago read as
// ending seven hours from now, so it stayed "resumable" all afternoon and the
// next meeting was silently appended to it; the list and the vault named the
// wrong day after 5pm.
//
// Pure and DOM-free so both directions can be pinned under a real time zone.

const SQLITE_UTC = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/**
 * Milliseconds since the epoch for a stored moment, or NaN when it is unknown.
 *
 * A zone-less timestamp is UTC, because that is the only thing SQLite writes.
 * A string carrying its own zone ("…Z", "…+02:00") is trusted as written, and
 * numbers and Dates pass through.
 *
 * @param {string | number | Date | null | undefined} value
 * @returns {number}
 */
export function parseDbTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const text = value.trim();
  if (!text) return NaN;
  const utc = SQLITE_UTC.exec(text);
  if (utc) return Date.parse(`${utc[1]}T${utc[2]}Z`);
  return Date.parse(text);
}

/**
 * The same moment as a Date — an Invalid Date when it is unknown, which every
 * formatter here already treats as "say nothing".
 *
 * @param {string | number | Date | null | undefined} value
 * @returns {Date}
 */
export function dbDate(value) {
  return new Date(parseDbTimestamp(value));
}
