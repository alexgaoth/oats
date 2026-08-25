// A conversation as a note in an Obsidian vault.
//
// Pure and DOM-free so it can be pinned: given a stored note, its topic
// snapshot and its events, produce the filename and the markdown. The main
// process writes the file; nothing here touches the filesystem.
//
// The point of the export is not that markdown is a nicer container than
// SQLite. It is that Oats already knows which conversations share a subject —
// `conversationTopics` computes it live and `lifetimeGraph` draws it — and a
// vault already has a graph view. Writing each topic as a `[[wikilink]]` hands
// that structure to a tool the reader already uses, instead of asking them to
// come back here to see it.

/** Characters no common filesystem will take, plus the ones Obsidian reads as syntax. */
const UNSAFE_FILENAME = /[/\\?%*:|"<>#^[\]]/g;

/** Obsidian resolves `[[a|b]]` as an alias, so a pipe inside a link breaks it. */
const UNSAFE_LINK = /[[\]|#^]/g;

/** Topics thinner than this got a sentence, not a subject; linking them makes a hairball. */
const MIN_TOPIC_MS = 20_000;

const pad = (n) => String(n).padStart(2, "0");

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

export function safeFilename(title, ms) {
  const cleaned = String(title || "")
    .replace(UNSAFE_FILENAME, "-")
    .replace(/\s+/g, " ")
    .trim();
  const stem = cleaned || "Untitled conversation";
  // The date leads so a vault folder sorts chronologically without a plugin.
  return `${isoDate(ms)} ${stem}`.slice(0, 120) + ".md";
}

export function topicLink(label) {
  const cleaned = String(label || "")
    .replace(UNSAFE_LINK, "")
    .replace(/\s+/g, " ")
    .trim();
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

/** YAML needs quoting for anything that could be read as structure. */
function yamlString(value) {
  const s = String(value ?? "");
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Build the vault note.
 *
 * `strings` carries every user-facing heading, so the export speaks the
 * reader's language rather than putting English headings in ten locales'
 * vaults — the same rule `transcriptText` follows for speaker labels.
 */
export function buildVaultNote({ note, snapshot, events = [], transcript = "", strings }) {
  const createdMs = Number.isFinite(note?.createdAtMs)
    ? note.createdAtMs
    : Date.parse(note?.created_at ?? "") || Date.now();

  const topics = linkableTopics(snapshot);
  const links = topics.map(topicLink).filter(Boolean);
  const duration = humanDuration(note?.audio_duration_seconds);

  const front = ["---", `date: ${isoDate(createdMs)}`, `source: ${yamlString("Oats")}`];
  if (duration) front.push(`duration: ${duration}`);
  if (topics.length) front.push(`topics: [${topics.map(yamlString).join(", ")}]`);
  front.push("---", "");

  const out = [...front, `# ${note?.title || strings.untitled}`, ""];

  const summary = (note?.enhanced_content || note?.content || "").trim();
  if (summary) out.push(`## ${strings.summary}`, "", summary, "");

  // Questions nobody answered are the reason to come back, so they lead the
  // body rather than trailing the transcript.
  const open = events.filter((e) => e?.kind === "question" && e?.metadata?.outcome !== "answered");
  if (open.length) {
    out.push(`## ${strings.openQuestions}`, "");
    for (const q of open) out.push(`- ${String(q.text || "").trim()}`);
    out.push("");
  }

  if (links.length) out.push(`## ${strings.topics}`, "", links.join(" · "), "");

  const body = String(transcript || "").trim();
  if (body) out.push(`## ${strings.transcript}`, "", body, "");

  return { filename: safeFilename(note?.title, createdMs), markdown: out.join("\n") };
}
