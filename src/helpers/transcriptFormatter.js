const { i18nMain } = require("./i18nMain");

// Who said a segment, decided as the screen decides it: `speakerLabelKind` in
// speakerTurns.mjs, the one rule the reading view, Copy and the vault share.
// This file is CommonJS in the main process and cannot import that module, so
// the rule is restated here, and test/helpers/transcriptFormatter.test.js runs
// every shape of segment through both. The saved transcript used to keep rules
// of its own: it numbered voices one higher than the screen (`assignSpeakers`
// already numbers from one, so `speaker_1` is Speaker 1), and it called every
// turn in a room whose voices had not been told apart "You".
function speakerLabelKind(seg) {
  if (!seg) return null;
  const name = typeof seg.speakerName === "string" ? seg.speakerName.trim() : "";
  if (name && !seg.speakerIsPlaceholder) return { kind: "name", name };
  const numbered = /^speaker_(\d+)$/.exec(String(seg.speaker ?? ""));
  const n = numbered ? Number(numbered[1]) : null;
  if (n) return { kind: "number", n };
  if (seg.speaker === "room") return null;
  return { kind: seg.source === "mic" ? "you" : "room" };
}

/** The speaker in the screen's words, or null where the screen shows no label. */
function resolveSpeaker(seg) {
  const kind = speakerLabelKind(seg);
  if (!kind) return null;
  if (kind.kind === "name") return kind.name;
  if (kind.kind === "number") return i18nMain.t("oats.intelligence.speakerN", { n: kind.n });
  return i18nMain.t(
    kind.kind === "you" ? "oats.intelligence.speakerYou" : "oats.intelligence.speakerRoom"
  );
}

// A segment's `timestamp` is the epoch millisecond it was said
// (`session.startedAt + startMs`). This file read it as seconds from the start,
// so a saved transcript opened at `[497644000:00:00]` and the two-second merge
// window was two milliseconds. Every time here is now milliseconds, and a turn
// is placed as the reading view's gutter places it: its distance from the first
// timed turn, never below zero.
const MERGE_GAP_MS = 2000;
const LAST_CUE_MS = 3000;

function mergeSegments(segments) {
  const list = Array.isArray(segments) ? segments : [];
  const origin = list.find((seg) => Number.isFinite(seg?.timestamp))?.timestamp;
  const merged = [];
  let lastAt = null;
  for (const seg of list) {
    if (!seg?.text?.trim()) continue;
    const at = Number.isFinite(seg.timestamp) ? Math.max(0, seg.timestamp - origin) : null;
    const last = merged[merged.length - 1];
    if (
      last &&
      last.speaker === (seg.speaker || "") &&
      at !== null &&
      lastAt !== null &&
      at - lastAt < MERGE_GAP_MS
    ) {
      last.text = last.text + " " + seg.text.trim();
      last.endAt = at;
    } else {
      merged.push({ ...seg, at, endAt: at, text: seg.text.trim() });
    }
    lastAt = at;
  }
  return merged;
}

// As the gutter writes it (`clock` in OatsWorkspace.tsx): 0:04, 1:05, 1:02:03.
function formatTimestamp(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

function formatSrtTimestamp(ms) {
  const total = Math.max(0, Math.round(ms));
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor(total / 60_000) % 60;
  const s = Math.floor(total / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(total % 1000, 3)}`;
}

// SQLite writes UTC as "2026-10-08 21:30:00", with no zone, and `new Date` reads
// a zone-less date-time as local time — so the date at the head of a saved
// transcript was off by the machine's UTC offset, seven hours in California.
// The same rule as `parseDbTimestamp` in dbTime.mjs (alexgaoth/oats#6), restated
// because this file is CommonJS: a zone-less stored time is UTC, and a string
// that carries its own zone is trusted as written.
const SQLITE_UTC = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

function storedDate(value) {
  const utc = typeof value === "string" ? SQLITE_UTC.exec(value.trim()) : null;
  return new Date(utc ? `${utc[1]}T${utc[2]}Z` : value);
}

function extractMetadata(note) {
  const title = note.title || "Untitled";
  const noteDate = storedDate(note.created_at);
  const dateStr =
    noteDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) +
    " " +
    noteDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  let participants = [];
  try {
    const parsed = JSON.parse(note.participants || "[]");
    participants = parsed.map((p) => p.name).filter(Boolean);
  } catch {}

  return { title, dateStr, participants };
}

function formatTxt(note, segments) {
  const merged = mergeSegments(segments);
  const { title, dateStr, participants } = extractMetadata(note);

  const lines = [title, dateStr];
  if (participants.length) lines.push(`Participants: ${participants.join(", ")}`);
  lines.push("", "──────────────────────────────────", "");
  for (const seg of merged) {
    // A turn the screen gives no speaker gets none here either, rather than a
    // guess; the time is left off only for a turn that has none.
    const speaker = resolveSpeaker(seg);
    const head = [seg.at === null ? "" : `[${formatTimestamp(seg.at)}]`, speaker && `${speaker}:`]
      .filter(Boolean)
      .join(" ");
    if (head) lines.push(head);
    lines.push(seg.text);
    lines.push("");
  }
  return lines.join("\n");
}

function formatSrt(segments) {
  const merged = mergeSegments(segments);
  const entries = [];
  for (let i = 0; i < merged.length; i++) {
    const seg = merged[i];
    const start = seg.at ?? 0;
    const end =
      i + 1 < merged.length ? (merged[i + 1].at ?? start) : (seg.endAt ?? start) + LAST_CUE_MS;
    const speaker = resolveSpeaker(seg);
    entries.push(`${i + 1}`);
    entries.push(`${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`);
    entries.push(speaker ? `${speaker}: ${seg.text}` : seg.text);
    entries.push("");
  }
  return entries.join("\n");
}

function formatJson(note, segments) {
  const merged = mergeSegments(segments);
  const { title, dateStr } = extractMetadata(note);

  const speakersSet = new Set();
  for (const seg of merged) {
    const speaker = resolveSpeaker(seg);
    if (speaker) speakersSet.add(speaker);
  }
  const lastSeg = merged[merged.length - 1];

  return JSON.stringify(
    {
      metadata: {
        title,
        date: dateStr,
        duration_seconds: lastSeg?.endAt != null ? Math.round(lastSeg.endAt / 1000) : 0,
        speaker_count: speakersSet.size,
        segment_count: merged.length,
      },
      speakers: [...speakersSet],
      segments: merged.map((seg) => ({
        speaker: resolveSpeaker(seg),
        // Seconds from the first turn, the same clock as the duration.
        timestamp: seg.at === null ? null : seg.at / 1000,
        text: seg.text,
      })),
    },
    null,
    2
  );
}

function formatMd(note, segments) {
  const merged = mergeSegments(segments);
  const { title, dateStr, participants } = extractMetadata(note);

  const lines = [`# ${title}`, "", `**Date:** ${dateStr}`];
  if (participants.length) lines.push(`**Participants:** ${participants.join(", ")}`);
  lines.push("", "---", "");
  for (const seg of merged) {
    const speaker = resolveSpeaker(seg);
    const head = [
      speaker && `**${speaker}**`,
      seg.at === null ? "" : `\`${formatTimestamp(seg.at)}\``,
    ]
      .filter(Boolean)
      .join(" ");
    if (head) lines.push(head);
    lines.push(`${seg.text}`, "");
  }
  return lines.join("\n");
}

// The save panel offers the one format that will be written. It used to list
// Text, SubRip, JSON and Markdown while the content followed the caller's
// `format` alone, so picking SubRip in the panel saved the text transcript
// under a .srt name. Format names are not translated.
const SAVE_FORMATS = {
  txt: { name: "Text", extensions: ["txt"] },
  srt: { name: "SubRip Subtitles", extensions: ["srt"] },
  json: { name: "JSON", extensions: ["json"] },
  md: { name: "Markdown", extensions: ["md"] },
};

/** The extension, and the panel's only filter, for a format; anything unknown is text. */
function saveFormat(format) {
  const ext = Object.hasOwn(SAVE_FORMATS, format) ? format : "txt";
  return { ext, filters: [SAVE_FORMATS[ext]] };
}

/** The transcript in the format `saveFormat` settles on. */
function formatTranscript(format, note, segments) {
  switch (saveFormat(format).ext) {
    case "srt":
      return formatSrt(segments);
    case "json":
      return formatJson(note, segments);
    case "md":
      return formatMd(note, segments);
    default:
      return formatTxt(note, segments);
  }
}

module.exports = {
  formatTxt,
  formatSrt,
  formatJson,
  formatMd,
  formatTranscript,
  saveFormat,
  speakerLabelKind,
  storedDate,
};
