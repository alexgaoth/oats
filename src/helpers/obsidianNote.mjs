// A conversation as a note in an Obsidian vault.
//
// Pure and DOM-free so it can be pinned: given a stored note, its topic
// snapshot, its events and its transcript segments, produce the filename and
// the markdown. The main process writes the file; nothing here touches the
// filesystem.
//
// The point of the export is not that markdown is a nicer container than
// SQLite. It is that Oats already knows which conversations share a subject —
// `conversationTopics` computes it live and `lifetimeGraph` draws it — and a
// vault already has a graph view. Writing each topic as a `[[wikilink]]` hands
// that structure to a tool the reader already uses, instead of asking them to
// come back here to see it.

import { buildConversationGraph, responseReason } from "./conversationGraph.mjs";
import { momentSegment, parseMoments } from "./conversationMoments.mjs";
import { speakerLabelKind } from "./speakerTurns.mjs";
import { parseDbTimestamp } from "./dbTime.mjs";

/** Characters no common filesystem will take, plus the ones Obsidian reads as syntax. */
const UNSAFE_FILENAME = /[/\\?%*:|"<>#^[\]]/g;

/** Obsidian resolves `[[a|b]]` as an alias, so a pipe inside a link breaks it. */
const UNSAFE_LINK = /[[\]|#^]/g;

/** Topics thinner than this got a sentence, not a subject; linking them makes a hairball. */
const MIN_TOPIC_MS = 20_000;

const pad = (n) => String(n).padStart(2, "0");

/** Speech has no line breaks in it; a title or a topic label with one is a parse hazard. */
const oneLine = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** `YYYY-MM-DD`, in local time — the date the reader remembers, not UTC's. */
export function isoDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Minutes, floored, with a floor of 1 so a short conversation is not "0m". */
export function humanDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  return `${Math.floor(mins / 60)}h${pad(mins % 60)}`;
}

/**
 * How long the conversation ran, taken from the transcript itself.
 *
 * `audio_duration_seconds` is written only by the INSERT in `saveNote`, and a
 * conversation's note is created *before* its recording starts — `updateNote`
 * does not even list the column as writable. So it is null for every
 * conversation Oats records, and a duration read from it never appeared at all.
 * The transcript is a timed record: every segment carries the epoch millisecond
 * it was finalized at, so the span it covers is the conversation's length, and
 * it comes from the speech rather than from a field nothing fills.
 */
export function transcriptSpanSeconds(segments) {
  const times = (Array.isArray(segments) ? segments : [])
    .map((segment) => segment?.timestamp)
    .filter((t) => Number.isFinite(t));
  if (times.length < 2) return null;
  return (Math.max(...times) - Math.min(...times)) / 1000;
}

export function safeFilename(title, ms) {
  const cleaned = oneLine(String(title || "").replace(UNSAFE_FILENAME, "-"));
  const stem = cleaned || "Untitled conversation";
  // The date leads so a vault folder sorts chronologically without a plugin.
  return `${isoDate(ms)} ${stem}`.slice(0, 120) + ".md";
}

export function topicLink(label) {
  const cleaned = oneLine(String(label || "").replace(UNSAFE_LINK, ""));
  return cleaned ? `[[${cleaned}]]` : null;
}

/**
 * The topics worth linking: substantial ones, most-discussed first.
 *
 * Every topic would link a conversation to everything it brushed past, which
 * makes the vault graph a hairball and is the opposite of the point.
 */
export function linkableTopics(snapshot, limit = 12) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  return nodes
    .filter((n) => n && n.label && (n.durationMs ?? 0) >= MIN_TOPIC_MS)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, limit)
    .map((n) => n.label);
}

/**
 * The questions nobody answered.
 *
 * The verdict comes from the same place the Intelligence surface's "what this
 * left open" panel reads it — the question's own `response` event, through
 * `buildConversationGraph`. It used to be read from `metadata.outcome` on the
 * *question*, which nothing writes there: the aide inserts a question as
 * `{ state: "asked" }` and merges `{ state: <outcome> }` over it, while
 * `outcome` belongs to responses and suggestions. So the filter matched every
 * question ever asked and the section listed the answered ones too.
 *
 * Going through the graph rather than that `state` is deliberate even now that
 * both are written: two lists of what a conversation left open — one on screen,
 * one in the reader's vault — must never be able to disagree.
 *
 * Repeats are never suppressed upstream (CLAUDE.md: each asking gets its own
 * card and its own event, sharing a `groupKey`), so one question can arrive
 * three times. One question is one line here, and it is open only if no asking
 * of it was ever answered — an answer on the third asking answers the question.
 */
export function openQuestions(events) {
  const groups = new Map();
  for (const node of buildConversationGraph(Array.isArray(events) ? events : [])) {
    if (!node.question) continue;
    const text = String(node.question.text || "").trim();
    if (!text) continue;
    const key = node.question.metadata?.groupKey || text.toLowerCase();
    const answered = responseReason(node.response) === "answered";
    const seen = groups.get(key);
    if (seen) seen.answered = seen.answered || answered;
    else groups.set(key, { text, answered });
  }
  return [...groups.values()].filter((group) => !group.answered).map((group) => group.text);
}

/**
 * Whether a note update is worth writing into the vault.
 *
 * The mirror hangs off `db-update-note`, which is also how a recording
 * checkpoints itself — and a conversation's note is created with a placeholder
 * title *before* the recording starts. So every lull in a recording used to
 * write `<date> Untitled conversation.md`, and when the real title landed after
 * the stop it was written *beside* that file, leaving the placeholder in the
 * reader's vault for good. Nothing is mirrored until the conversation has a
 * name of its own.
 *
 * Dictation is excluded for the same reason it always was: every dictation is a
 * note too, and mirroring those fills the vault with one-line fragments.
 */
export function shouldMirrorNote(note, placeholderTitle) {
  if (!note || note.note_type !== "meeting") return false;
  const title = oneLine(note.title);
  return Boolean(title) && title !== oneLine(placeholderTitle);
}

/** YAML needs quoting for anything that could be read as structure. */
function yamlString(value) {
  const s = String(value ?? "");
  return `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

/** An offset into the conversation, as the transcript gutter writes it. */
function offset(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = pad(total % 60);
  return hours ? `${hours}:${pad(minutes)}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * The moments the reader marked, as list items: when, the words being said,
 * and the note if there is one. Empty when nothing was marked.
 */
export function markedLines(rawMoments, segments) {
  const moments = parseMoments(rawMoments);
  if (!moments.length) return [];
  const timed = (Array.isArray(segments) ? segments : []).filter((segment) =>
    Number.isFinite(segment?.timestamp)
  );
  const start = timed.length
    ? Math.min(...timed.map((segment) => segment.timestamp))
    : moments[0].at;
  return moments.map((moment) => {
    const said = oneLine(momentSegment(moment, timed)?.text);
    const note = oneLine(moment.note);
    return [`- \`${offset(moment.at - start)}\``, said && `“${said}”`, note && `— ${note}`]
      .filter(Boolean)
      .join(" ");
  });
}

/** The stored transcript as speaker-labelled markdown, in the reader's language. */
function renderTranscript(segments, strings) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => {
      const text = String(segment?.text || "").trim();
      if (!text) return null;
      const kind = speakerLabelKind(segment);
      if (!kind) return text;
      const label =
        kind.kind === "name"
          ? kind.name
          : kind.kind === "number"
            ? strings.speaker(kind.n)
            : kind.kind === "you"
              ? strings.you
              : strings.room;
      return `**${label}:** ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The summary tab, as a file: what is on screen when "Save" is pressed there.
 *
 * The title, what the reader marked, what the conversation left open, and the
 * summary — in the order the reading view shows them. It used to be the title
 * and the model's prose alone, so the parts of the record that are certain
 * (the marks, the unanswered questions) stayed behind whenever a conversation
 * was saved or shared. Built from the same pieces as the vault note so the two
 * cannot drift; no frontmatter and no transcript, because those are the vault's
 * and the transcript tab's.
 */
export function buildReadingExport({ note, events = [], segments = [], strings }) {
  const out = [`# ${oneLine(note?.title) || strings.untitled}`, ""];
  const marked = markedLines(note?.conversation_marks, segments);
  if (marked.length) out.push(`## ${strings.marked}`, "", ...marked, "");
  const open = openQuestions(events);
  if (open.length) {
    out.push(`## ${strings.openQuestions}`, "");
    for (const question of open) out.push(`- ${question}`);
    out.push("");
  }
  const body = String(note?.enhanced_content || note?.content || "").trim();
  // A summary that already opens with its own H1 would put two titles on top.
  if (body) out.push(body.replace(/^# .*\n+/, ""), "");
  return out.join("\n");
}

/**
 * Build the vault note.
 *
 * `strings` carries every user-facing heading and speaker label, so the export
 * speaks the reader's language rather than putting English headings in ten
 * locales' vaults.
 */
export function buildVaultNote({ note, snapshot, events = [], segments = [], strings }) {
  const createdMs = Number.isFinite(note?.createdAtMs)
    ? note.createdAtMs
    : parseDbTimestamp(note?.created_at) || Date.now();

  const topics = linkableTopics(snapshot);
  const links = topics.map(topicLink).filter(Boolean);
  const recorded = Number.isFinite(note?.audio_duration_seconds)
    ? note.audio_duration_seconds
    : null;
  const duration = humanDuration(recorded > 0 ? recorded : transcriptSpanSeconds(segments));

  const front = ["---", `date: ${isoDate(createdMs)}`, `source: ${yamlString("Oats")}`];
  // The conversation's own id, so the mirror can recognise its file after the
  // reader renames the conversation and never overwrites somebody else's note
  // that happens to share a title and a date.
  if (Number.isFinite(note?.id)) front.push(`oats_id: ${note.id}`);
  if (duration) front.push(`duration: ${duration}`);
  if (topics.length) front.push(`topics: [${topics.map(yamlString).join(", ")}]`);
  front.push("---", "");

  const out = [...front, `# ${oneLine(note?.title) || strings.untitled}`, ""];

  const summary = (note?.enhanced_content || note?.content || "").trim();
  if (summary) out.push(`## ${strings.summary}`, "", summary, "");

  // What the reader marked leads what the room left open: it is the part of
  // the record that is theirs.
  const marked = markedLines(note?.conversation_marks, segments);
  if (marked.length && strings.marked) out.push(`## ${strings.marked}`, "", ...marked, "");

  // Questions nobody answered are the reason to come back, so they lead the
  // body rather than trailing the transcript.
  const open = openQuestions(events);
  if (open.length) {
    out.push(`## ${strings.openQuestions}`, "");
    for (const question of open) out.push(`- ${question}`);
    out.push("");
  }

  if (links.length) out.push(`## ${strings.topics}`, "", links.join(" · "), "");

  const body = renderTranscript(segments, strings);
  if (body) out.push(`## ${strings.transcript}`, "", body, "");

  return { filename: safeFilename(note?.title, createdMs), markdown: out.join("\n") };
}
