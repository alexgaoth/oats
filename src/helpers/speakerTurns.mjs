// Who said each segment of a conversation recorded from one microphone.
//
// The diarizer, run over the whole recording after Stop, returns turns —
// `{ start, end, speaker }` in seconds — and knows nothing about words. Each
// transcript segment knows its own place in the recording (`startMs`/`endMs`,
// from the speech segmenter), so a segment is given the speaker it overlaps
// most. Exact offsets, not arrival time: a segment stamped when its
// transcription finished lands seconds after it was said, on the next person.
//
// Speakers are numbered in the order they first spoke — Speaker 1 opened the
// conversation — because the diarizer's own labels are cluster ids and carry
// no meaning a reader could use. A conversation that turns out to be one voice
// is labelled nothing at all: "Speaker 1" on every line says less than no
// label, and invites the reader to look for a second person who is not there.
//
// Pure and DOM-free; pinned by test/helpers/speakerTurns.test.js.

/** A segment further than this from every turn is not guessed at. */
const NEAREST_MS = 1500;

// Upstream OpenWhispr's rules (diarizationPolicy.js, 1.10.2), learned on real
// calls rather than on read speech, and about cluster sizes rather than voices,
// so they hold for any embedding model. A backchannel or a turn start is too
// short to embed well and lands near neither voice: a 20-minute two-person call
// produced four such phantoms holding 8% of the speech. And when clustering
// merges two people, one cluster holds nearly everything beside phantoms —
// labelling that run would name one person twice and the other never.
const MIN_VOICE_MS = 1000;
const PHANTOM_MAX_SHARE = 0.1;
const PHANTOM_MAX_MEAN_MS = 3000;
const PROTECTED_VOICES = 2;
const COLLAPSED_TOP_SHARE = 0.93;
const COLLAPSED_MAX_MEAN_MS = 2200;

/**
 * The turns of voices that are people: phantoms dropped, and nothing at all
 * when the clustering collapsed two people into one.
 */
function realVoices(turns) {
  const voices = new Map();
  let total = 0;
  for (const turn of turns) {
    const voice = voices.get(turn.label) ?? { ms: 0, count: 0 };
    voice.ms += turn.endMs - turn.startMs;
    voice.count += 1;
    voices.set(turn.label, voice);
    total += turn.endMs - turn.startMs;
  }
  const heard = [...voices]
    .filter(([, voice]) => voice.ms >= MIN_VOICE_MS)
    .sort((a, b) => b[1].ms - a[1].ms);
  if (heard.length >= 2) {
    const [[, top], ...rest] = heard;
    const heardMs = heard.reduce((sum, [, voice]) => sum + voice.ms, 0);
    const collapsed =
      top.ms / heardMs > COLLAPSED_TOP_SHARE &&
      rest.every(([, voice]) => voice.ms / voice.count < COLLAPSED_MAX_MEAN_MS);
    if (collapsed) return [];
  }
  const keep = new Set(
    heard
      .filter(
        ([, voice], rank) =>
          rank < PROTECTED_VOICES ||
          voice.ms / total >= PHANTOM_MAX_SHARE ||
          voice.ms / voice.count >= PHANTOM_MAX_MEAN_MS
      )
      .map(([label]) => label)
  );
  return turns.filter((turn) => keep.has(turn.label));
}

/**
 * @param {Array<{ id: string, startMs?: number, endMs?: number }>} segments
 * @param {Array<{ start: number, end: number, speaker: string }>} turns seconds
 * @returns {{ assignments: Map<string, string>, speakers: string[] }}
 *   segment id → "speaker_N" (1-based, by first appearance), and the speakers
 *   in that order. Empty when fewer than two speakers were found.
 */
export function assignSpeakers(segments, turns) {
  const list = realVoices(
    (Array.isArray(turns) ? turns : [])
      .filter((t) => t && Number.isFinite(t.start) && Number.isFinite(t.end) && t.end > t.start)
      .map((t) => ({ startMs: t.start * 1000, endMs: t.end * 1000, label: String(t.speaker) }))
  );
  const raw = new Map();
  if (!list.length) return { assignments: raw, speakers: [] };

  const timed = (Array.isArray(segments) ? segments : [])
    .filter((s) => s && s.id != null && Number.isFinite(s.startMs) && Number.isFinite(s.endMs))
    .sort((a, b) => a.startMs - b.startMs);

  for (const segment of timed) {
    const share = new Map();
    for (const turn of list) {
      const overlap = Math.min(segment.endMs, turn.endMs) - Math.max(segment.startMs, turn.startMs);
      if (overlap > 0) share.set(turn.label, (share.get(turn.label) ?? 0) + overlap);
    }
    let label = null;
    let most = 0;
    for (const [candidate, ms] of share) {
      if (ms > most) [label, most] = [candidate, ms];
    }
    if (!label) {
      // Speech the diarizer left between its turns: the nearest turn, if near.
      let gap = NEAREST_MS;
      for (const turn of list) {
        const distance = Math.max(turn.startMs - segment.endMs, segment.startMs - turn.endMs);
        if (distance < gap) [label, gap] = [turn.label, distance];
      }
    }
    if (label) raw.set(String(segment.id), label);
  }

  // Renumber by first appearance in the transcript.
  const order = [];
  for (const segment of timed) {
    const label = raw.get(String(segment.id));
    if (label && !order.includes(label)) order.push(label);
  }
  if (order.length < 2) return { assignments: new Map(), speakers: [] };
  const rename = new Map(order.map((label, i) => [label, `speaker_${i + 1}`]));
  const assignments = new Map();
  for (const [id, label] of raw) assignments.set(id, rename.get(label));
  return { assignments, speakers: order.map((label) => rename.get(label)) };
}

/** "speaker_3" → 3; anything else → null. */
export function speakerNumber(speaker) {
  const match = /^speaker_(\d+)$/.exec(String(speaker ?? ""));
  return match ? Number(match[1]) : null;
}

/**
 * What to call the speaker of a stored segment — one rule for the reading view,
 * copy and export, and the vault, so a transcript cannot name one person two
 * ways in two places. Returns a kind for the caller to put into words:
 *
 *   { kind: "name", name }  somebody the reader named
 *   { kind: "number", n }   a voice told apart after Stop, not yet named
 *   { kind: "you" | "room" } an online call's two sides
 *   null                    a conversation in one room whose voices have not
 *                           been told apart — no label beats a wrong one, and
 *                           "You" on every line of a two-person conversation
 *                           was a wrong one
 */
export function speakerLabelKind(segment) {
  if (!segment) return null;
  const name = typeof segment.speakerName === "string" ? segment.speakerName.trim() : "";
  if (name && !segment.speakerIsPlaceholder) return { kind: "name", name };
  const n = speakerNumber(segment.speaker);
  if (n) return { kind: "number", n };
  if (segment.speaker === "room") return null;
  return { kind: segment.source === "mic" ? "you" : "room" };
}
