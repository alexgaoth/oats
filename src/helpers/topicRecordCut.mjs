// The record's topics, cut by the writing model when a conversation ends.
//
// The change detector (topicChange.mjs) reads pauses with arithmetic on
// numbers the app has. Within 10 s of a real change of subject (about one
// sentence) it finds 21% of them on AMI meetings and 3-6% on talks and
// two-person videos heard by the app, and no setting of it does much better:
// about 30% found and 30% real even with the whole recording in hindsight.
// A model that reads the words finds most of them. Gemma 4 E4B, the writing
// model on a Mac with 16 GB or more, finds 48-67% within 10 s, and the cuts
// it gets near land a median 3-5 s from the change (scripts/topic-loop-eval.mjs
// --variant vf).
//
// So at Finish the model gets the whole conversation as numbered lines (turns
// joined to 14-45 words) and says where each topic starts; a long one goes in
// chunks, each told the topics found before it. Lines it leaves in a topic of
// fewer than `minRunWords` words join the topic around them. What comes back is
// where topics start, by utterance id: the tracker builds the record's topics
// from those (`ConversationTopicTracker.setRecordCuts`), with the ids, names
// and returns it already keeps.
//
// The model is behind `ask`, as in topicLoop.mjs: `ask({ kind, system, user,
// schema, maxTokens, timeoutMs })` resolves to `{ ok, json }`. Nothing here
// knows which model answers. Pure and DOM-free, so it unit-tests under
// node:test, and the eval runs this same code.

/** Words a numbered line holds: turns are joined until a line has `min`, at most `max`. */
export const RECORD_LINE_WORDS = Object.freeze({ min: 14, max: 45 });

/** Words a request holds at most; a longer conversation goes in chunks. */
export const RECORD_CHUNK_WORDS = 6000;

/** Characters of a line the request quotes. */
export const RECORD_LINE_CHARS = 400;

/** A topic of fewer words joins the one around it. */
export const RECORD_MIN_RUN_WORDS = 60;

/**
 * Minutes a topic usually holds, for the count hint (`minutesPerTopic`) the
 * app gives a writing model on this computer. Without it Gemma 4 E4B drew 1.2
 * times the real number of topics on 18 min videos and 2.4 to 2.7 times on
 * 30 min ones (docs/fast-models.md).
 */
export const RECORD_MINUTES_PER_TOPIC = 5;

const NAME_RULES =
  "A name has 2 to 5 words, says specifically what the part is about (the thing, question, problem or decision), is in sentence case in the language spoken, has no quotation marks, and is not generic (not Discussion, Meeting, Update, Introduction, Small talk).";

const REPLY =
  'Reply with JSON only: {"segments": [{"from": 1, "topic": "T1"}, {"from": 57, "topic": "T2"}], "topics": [{"key": "T1", "name": "...", "gist": "..."}]}';

export const RECORD_SYSTEM = [
  "You divide the transcript of a recorded conversation into its topics. The lines come from speech recognition: expect errors, filler and half sentences. Who said a line is not known.",
  "",
  "Give the topics as segments, in order: each segment has the number of its first line, runs until the next segment, and has a topic key (T1, T2, ...). When the conversation goes back to an earlier topic, use that topic's key again. Give each key a name and a gist (one line, at most 12 words).",
  "",
  "A topic usually holds 2 to 10 minutes of talk: one subject, problem, decision or agenda item. A short aside, a joke or one remark stays in the topic around it. The request says how long the conversation lasted.",
  NAME_RULES,
  "",
  REPLY,
].join("\n");

/** Stricter: only a change of subject starts a topic, at the line that raises it, and a doubt is no cut. */
export const RECORD_SYSTEM_STRICT = [
  "You divide the transcript of a recorded conversation into its main topics. The lines come from speech recognition: expect errors, filler and half sentences. Who said a line is not known.",
  "",
  "Give the topics as segments, in order: each segment has the number of its first line, runs until the next segment, and has a topic key (T1, T2, ...). When the conversation goes back to an earlier topic, use that topic's key again. Give each key a name and a gist (one line, at most 12 words).",
  "",
  "A topic is one subject the people stay on for several minutes: an agenda item, a problem, a decision, a part of a talk. Most topics hold 3 to 10 minutes of talk. Start a new segment only where the subject itself changes. A new example, question, detail, story, argument or step about the same subject stays in that topic, and so does a short aside or joke.",
  'A segment starts at the line where its subject is first raised (often a line like "next, let\'s talk about ..." or "so, the budget"), not at a later line. When you are not sure the subject changed, do not start a segment. The request says how long the conversation lasted.',
  NAME_RULES,
  "",
  REPLY,
].join("\n");

export const RECORD_SCHEMA = {
  name: "topic_record",
  schema: {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: { from: { type: "integer" }, topic: { type: "string" } },
          required: ["from", "topic"],
          additionalProperties: false,
        },
      },
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            gist: { type: "string" },
          },
          required: ["key", "name", "gist"],
          additionalProperties: false,
        },
      },
    },
    required: ["segments", "topics"],
    additionalProperties: false,
  },
};

export const VERIFY_SYSTEM = [
  "You check one proposed change of topic in the transcript of a recorded conversation. The lines come from speech recognition: expect errors, filler and half sentences. Who said a line is not known.",
  "",
  'You get numbered lines and the line before which a new topic is proposed. Decide whether the conversation moves to a different subject near that line (decision new) or stays on the same subject (decision same). A new example, question, detail, story or step of the same subject is same. When it is new, give the number of the line where the new subject is first raised (often a line like "next, let\'s talk about ..."): the proposed line or one near it.',
  "",
  'Reply with JSON only: {"decision": "new", "first": 12}',
].join("\n");

export const VERIFY_SCHEMA = {
  name: "topic_cut_check",
  schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["new", "same"] },
      first: { type: "integer" },
    },
    required: ["decision", "first"],
    additionalProperties: false,
  },
};

const oneLine = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const countWords = (text) => oneLine(text).split(" ").filter(Boolean).length;

// A model that fails or throws is the same as one with no answer.
async function askFor(ask, request) {
  try {
    return await ask(request);
  } catch {
    return null;
  }
}

function clip(text, max) {
  const line = oneLine(text);
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function minutesText(minutes) {
  return minutes < 1 ? "under a minute" : `${Math.round(minutes)} min`;
}

/**
 * Turns joined until a line holds `min` words (and at most `max`), so a long
 * meeting is a few hundred numbered lines.
 *
 * @param {Array<{ id: unknown, text: string, at?: number }>} utterances
 */
export function recordLines(
  utterances,
  { min = RECORD_LINE_WORDS.min, max = RECORD_LINE_WORDS.max } = {}
) {
  const lines = [];
  let current = null;
  for (const utterance of utterances) {
    const words = countWords(utterance.text);
    if (!current || current.words >= min || current.words + words > max) {
      current = { ids: [], text: "", words: 0, at: utterance.at ?? null };
      lines.push(current);
    }
    current.ids.push(String(utterance.id));
    current.text = current.text
      ? `${current.text} ${oneLine(utterance.text)}`
      : oneLine(utterance.text);
    current.words += words;
  }
  return lines;
}

/**
 * Folds runs of lines shorter than `minWords` words into the topic around
 * them: the run before (or, for the first, the one after; or `before`, the
 * topic of the line before these). A model that cuts too finely makes a
 * topic of every aside, and the lanes would flick between topics every few
 * seconds; one that cuts coarsely is not changed. `keepLast` leaves the last
 * run alone: it may be a topic that has only begun.
 *
 * @param {Array<string | null>} labels A topic key per line.
 * @param {number[]} weights Words per line.
 * @returns {Array<string | null>}
 */
export function smoothRuns(labels, weights, minWords, { before = null, keepLast = false } = {}) {
  const out = [...labels];
  for (let guard = 0; guard < out.length; guard += 1) {
    const runs = [];
    for (let index = 0; index < out.length; index += 1) {
      const last = runs.at(-1);
      if (last && last.label === out[index]) {
        last.to = index;
        last.words += weights[index] ?? 0;
      } else runs.push({ label: out[index], from: index, to: index, words: weights[index] ?? 0 });
    }
    if (runs.length < 2 && !(before && runs[0]?.label !== before)) break;
    let shortest = -1;
    runs.forEach((run, index) => {
      if (keepLast && index === runs.length - 1) return;
      if (run.words >= minWords) return;
      if (index === 0 && runs.length === 1) return;
      if (shortest < 0 || run.words < runs[shortest].words) shortest = index;
    });
    if (shortest < 0) break;
    const run = runs[shortest];
    const previous = shortest > 0 ? runs[shortest - 1].label : before;
    const next = runs[shortest + 1]?.label ?? null;
    const target = previous ?? next;
    if (target === null || target === run.label) break;
    for (let index = run.from; index <= run.to; index += 1) out[index] = target;
  }
  return out;
}

/**
 * The segments of a reply, checked: each starts at a line of the chunk, in
 * order, the first at line 1. Null when the reply has none.
 */
export function readSegments(json, count) {
  const segments = Array.isArray(json?.segments) ? json.segments : null;
  if (!segments?.length) return null;
  const starts = segments
    .map((segment) => ({ from: Number(segment?.from), topic: oneLine(segment?.topic) }))
    .filter(
      (segment) =>
        Number.isInteger(segment.from) &&
        segment.from >= 1 &&
        segment.from <= count &&
        segment.topic
    )
    .sort((a, b) => a.from - b.from);
  if (!starts.length) return null;
  starts[0].from = 1;
  return starts;
}

/**
 * Cuts a whole conversation into topics with the writing model.
 *
 * `system` "strict" asks for main topics only (RECORD_SYSTEM_STRICT).
 * `minutesPerTopic` tells the model about how many topics are usual for the
 * length. `verify` asks once more about each cut, with `before` and `after`
 * lines around it: one the model calls the same subject is removed, one it
 * places on a nearby line moves there. `deadline` (ms on `now`) ends the
 * checks early; the cuts not checked stay.
 *
 * Resolves to `{ starts, topics, labels, calls }`: `starts` the utterance ids
 * a topic starts at (not the first), `labels` a topic key per utterance with
 * words, `topics` the model's name and gist per key. Null when no chunk gave
 * a usable answer: the caller keeps the cuts it had.
 *
 * @param {{ ask: (request: object) => Promise<{ ok: boolean, json?: any } | null>,
 *   utterances: Array<{ id: unknown, text: string, at?: number }>,
 *   chunkWords?: number, lineChars?: number, minRunWords?: number,
 *   system?: "base" | "strict", minutesPerTopic?: number | null,
 *   verify?: boolean | { before?: number, after?: number } | null,
 *   now?: () => number, deadline?: number | null }} options
 */
export async function cutRecord({
  ask,
  utterances,
  chunkWords = RECORD_CHUNK_WORDS,
  lineChars = RECORD_LINE_CHARS,
  minRunWords = RECORD_MIN_RUN_WORDS,
  system = "base",
  minutesPerTopic = null,
  verify = null,
  now = Date.now,
  deadline = null,
}) {
  // The tracker skips a turn with no words; a topic cannot start at one.
  const spoken = (utterances ?? []).filter((utterance) => oneLine(utterance?.text));
  const lines = recordLines(spoken);
  if (!lines.length) return null;
  const chunks = [];
  let chunk = [];
  let words = 0;
  for (const line of lines) {
    if (chunk.length && words + line.words > chunkWords) {
      chunks.push(chunk);
      chunk = [];
      words = 0;
    }
    chunk.push(line);
    words += line.words;
  }
  if (chunk.length) chunks.push(chunk);

  const calls = [];
  const lineLabels = new Array(lines.length).fill(null);
  /** @type {Map<string, { name: string, gist: string }>} */
  const topics = new Map();
  let answered = 0;
  let offset = 0;
  for (const part of chunks) {
    const known = [...topics.entries()].map(
      ([key, topic]) => `${key} | ${topic.name} | ${topic.gist}`
    );
    const first = part[0].at ?? 0;
    const last = part.at(-1).at ?? first;
    const minutes = Math.max(0, last - first) / 60_000;
    const user = [
      ...(known.length
        ? ["TOPICS FOUND BEFORE THESE LINES (reuse their keys for a return):", ...known, ""]
        : []),
      ...(minutesPerTopic
        ? [
            `About ${Math.max(1, Math.round(minutes / minutesPerTopic))} topics is usual for this length; follow the conversation, not this number.`,
            "",
          ]
        : []),
      `LINES (${minutesText(minutes)} of conversation):`,
      ...part.map((line, index) => `${index + 1}. ${clip(line.text, lineChars)}`),
    ].join("\n");
    const result = await askFor(ask, {
      kind: "record",
      system: system === "strict" ? RECORD_SYSTEM_STRICT : RECORD_SYSTEM,
      user,
      schema: RECORD_SCHEMA,
      maxTokens: 4000,
      timeoutMs: 120_000,
    });
    const starts = result?.ok ? readSegments(result.json, part.length) : null;
    calls.push({ kind: "record", ok: Boolean(result?.ok), usable: Boolean(starts) });
    if (starts) {
      answered += 1;
      for (const item of Array.isArray(result.json?.topics) ? result.json.topics : []) {
        const key = oneLine(item?.key);
        if (key && !topics.has(key))
          topics.set(key, { name: oneLine(item?.name), gist: oneLine(item?.gist).slice(0, 120) });
      }
      starts.forEach((start, index) => {
        const to = (starts[index + 1]?.from ?? part.length + 1) - 1;
        for (let line = start.from - 1; line < to; line += 1)
          lineLabels[offset + line] = start.topic;
      });
    } else {
      // This stretch stays in the topic before it.
      const before = offset ? lineLabels[offset - 1] : null;
      for (let line = 0; line < part.length; line += 1) lineLabels[offset + line] = before;
    }
    offset += part.length;
  }
  if (!answered) return null;
  // A first chunk with no answer takes the topic of the first answered one.
  const firstKnown = lineLabels.find((label) => label !== null) ?? null;
  for (let index = 0; index < lineLabels.length && lineLabels[index] === null; index += 1)
    lineLabels[index] = firstKnown;

  if (verify) {
    const { before = 10, after = 10 } = verify === true ? {} : verify;
    await verifyCuts({
      ask,
      lines,
      labels: lineLabels,
      lineChars,
      before,
      after,
      calls,
      now,
      deadline,
    });
  }

  let labels = lines.flatMap((line, index) => line.ids.map(() => lineLabels[index]));
  if (minRunWords > 0) {
    labels = smoothRuns(
      labels,
      spoken.map((utterance) => countWords(utterance.text)),
      minRunWords
    );
  }
  const ids = lines.flatMap((line) => line.ids);
  const starts = ids.filter((_, index) => index && labels[index] !== labels[index - 1]);
  return { starts, labels, topics, calls };
}

/** Asks about each cut (`cutRecord`'s `verify`), changing `labels` in place. */
async function verifyCuts({ ask, lines, labels, lineChars, before, after, calls, now, deadline }) {
  const cuts = () =>
    labels.flatMap((label, index) => (index && label !== labels[index - 1] ? [index] : []));
  const fill = (from, to, label) => {
    for (let index = from; index < to; index += 1) labels[index] = label;
  };
  for (const proposed of cuts()) {
    if (deadline !== null && now() >= deadline) break;
    const current = cuts();
    const position = current.indexOf(proposed);
    if (position < 0) continue;
    const previous = current[position - 1] ?? 0;
    const next = current[position + 1] ?? lines.length;
    const from = Math.max(0, proposed - before);
    const window = lines.slice(from, Math.min(lines.length, proposed + after));
    const user = [
      `A new topic is proposed to start at line ${proposed - from + 1}.`,
      "",
      "LINES:",
      ...window.map((line, index) => `${index + 1}. ${clip(line.text, lineChars)}`),
    ].join("\n");
    const result = await askFor(ask, {
      kind: "verify",
      system: VERIFY_SYSTEM,
      user,
      schema: VERIFY_SCHEMA,
      maxTokens: 200,
      timeoutMs: 60_000,
    });
    const decision = result?.ok ? result.json?.decision : null;
    calls.push({
      kind: "verify",
      ok: Boolean(result?.ok),
      usable: decision === "new" || decision === "same",
    });
    if (decision === "same") {
      fill(proposed, next, labels[proposed - 1]);
      continue;
    }
    if (decision !== "new") continue;
    const first = Number(result.json.first);
    if (!Number.isInteger(first)) continue;
    const target = Math.min(next - 1, Math.max(previous + 1, from + first - 1));
    if (target < proposed) fill(target, proposed, labels[proposed]);
    else if (target > proposed) fill(proposed, target, labels[proposed - 1]);
  }
}
