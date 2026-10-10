// The conversation contour — Oats' signature mark (DESIGN.md §9.8).
//
// A conversation, drawn as the thing it actually was: a line of time, thick
// where people spoke and thin where they did not, notched where the subject
// changed, marked above wherever somebody asked something, and tied back to
// itself wherever the room returned to a thread it had left.
//
// It replaces the pastoral field that used to sit behind every surface. The
// difference that matters is not that one is prettier: the field was invented
// by a noise function and told you nothing, and every pixel of this is a
// measurement of your own conversation. Two conversations cannot produce the
// same contour, and a conversation that went badly looks like it.
//
// Pure and DOM-free on purpose — the same reason `conversationGraph.mjs` and
// `conversationAide.mjs` are: `node:test` imports it directly, with no
// TypeScript build and no renderer, so the geometry can be pinned rather than
// eyeballed. Both the live contour and the miniature in the Intelligence list
// read this one model, so they cannot drift apart.

/** Buckets along the trace. Enough to show shape; few enough to stay a line. */
export const CONTOUR_RESOLUTION = 96;

/**
 * Density is smoothed across neighbours before it is drawn.
 *
 * Without this a contour is a bar chart of who happened to be talking during
 * each 1/96th of an hour, which is noise rather than shape — the eye reads
 * "busy" and nothing else.
 */
const SMOOTHING = 2;

/**
 * Words per second of speech, used to give an utterance a duration.
 *
 * Utterances arrive as instants — one timestamp, no end — and treating them as
 * instants is what made an early version of this useless: a twenty-minute
 * conversation of thirty utterances put thirty spikes into ninety-six buckets
 * and left the rest at zero, so every conversation drew the same flat comb and
 * the miniature in the list averaged it into an identical smear.
 *
 * Speech occupies time. A sentence of twenty words took about six seconds to
 * say, and spreading its weight across those six seconds is both truer and the
 * thing that makes two conversations look different: steady talking becomes a
 * full band, and a gap in the line is a gap in the room.
 *
 * 2.6 w/s is unhurried conversational English. It is a constant rather than a
 * measurement because the exact figure changes the shape not at all — what
 * matters is that long utterances occupy proportionally more time than short
 * ones.
 */
const WORDS_PER_SECOND = 2.6;

/** A bucket at or under this share of the loudest bucket reads as a silence. */
export const QUIET_THRESHOLD = 0.18;

/**
 * How a question's mark is drawn, per outcome.
 *
 * Every mark is a complete circle of one size. How settled the question is
 * shows in the fill: filled when the room settled it, a soft fill inside a
 * ring when the answer was hedged, an empty ring when nobody gave a verdict.
 * The fill carries the meaning without colour; the status colour repeats it.
 * A half-filled disc was tried and read as a mark that had failed to draw.
 */
export const OUTCOME_FILL = {
  answered: "solid", // settled
  denied: "solid", // settled: somebody said they did not know
  uncertain: "soft", // hedged
  asked: "ring", // no verdict yet
  silence: "ring", // nobody answered
};

/** Rounds to 4dp so pinned geometry does not depend on float noise. */
function round(value) {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Words in an utterance. Deliberately crude: the contour needs "how much was
 * said", and a word count is a better proxy for that than character length,
 * which would make one long URL look like a minute of speech.
 *
 * CJK has no spaces, so a run of ideographs is counted per character — without
 * this a Japanese conversation renders as an almost flat line.
 */
export function speechWeight(text) {
  if (!text) return 0;
  const cjk = (text.match(/[぀-ヿ㐀-䶿一-鿿豈-﫿]/g) || []).length;
  const words = text
    .replace(/[぀-ヿ㐀-䶿一-鿿豈-﫿]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return words + cjk;
}

/**
 * Build the contour.
 *
 * @param {object} input
 * @param {Array<{ id?: string, text?: string, timestamp?: number }>} input.utterances
 *   Finalized speech, in order.
 * @param {Array<{ id?: string, question?: string, state?: string, createdAt?: number,
 *   groupKey?: string, occurrence?: number }>} [input.questions]
 *   Question cards. Repeats keep their own entry — a re-asking is the signal.
 * @param {Array<{ id?: string, label?: string, state?: string, startedAt?: number,
 *   lastTouchedAt?: number }>} [input.topics]
 *   Topic nodes from the tracker. Their starts become the trace's notches.
 * @param {Array<{ id?: string, at?: number, note?: string }>} [input.moments]
 *   Instants somebody pressed "Mark" (`conversationMoments.mjs`). The one
 *   element not measured from the room: it is the person in it saying *this*.
 * @param {number} [input.now] End of the window. Defaults to the last event.
 * @param {number} [input.startedAt] Start of the window. Defaults to the first.
 * @returns {{ points: Array<{x: number, y: number, quiet: boolean}>,
 *   marks: Array<object>, shifts: Array<object>, returns: Array<object>,
 *   moments: Array<{ id: string, x: number, at: number, note: string }>,
 *   span: number, start: number, empty: boolean }}
 *   `start` and `span` are the window in epoch ms, so a position on the trace
 *   can be turned back into the moment it stands for.
 *   All coordinates are normalized 0..1: `x` is time, `y` is speech density.
 *   The renderer owns pixels; this owns meaning.
 */
export function buildContour({
  utterances = [],
  questions = [],
  topics = [],
  moments = [],
  now,
  startedAt,
}) {
  const timed = utterances
    .filter((u) => Number.isFinite(u?.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const firstAt = Number.isFinite(startedAt) ? startedAt : timed.length ? timed[0].timestamp : null;
  const lastAt = Number.isFinite(now)
    ? now
    : timed.length
      ? timed[timed.length - 1].timestamp
      : null;

  // A conversation with nothing in it yet is not an error and must not be
  // faked. The surface draws a resting baseline and waits.
  if (firstAt === null || lastAt === null || lastAt <= firstAt) {
    return {
      points: [],
      marks: [],
      shifts: [],
      returns: [],
      moments: [],
      span: 0,
      start: 0,
      empty: true,
    };
  }

  const span = lastAt - firstAt;
  const at = (timestamp) => clamp01((timestamp - firstAt) / span);

  // Speech from outside the window is dropped, not clamped onto its edge.
  //
  // Continuing a recent conversation seeds up to half an hour of the previous
  // sitting's utterances into the store. With an explicit window starting at
  // the press, clamping piled every one of them onto x=0 — and because each
  // utterance is spread across the time it took to say, the pile then smeared
  // across the whole trace and drew a solid slab. Questions were already
  // dropped this way; speech has to agree with them.
  const inWindow = timed.filter(
    (utterance) => utterance.timestamp >= firstAt && utterance.timestamp <= lastAt
  );

  // 1. Speech density — words per unit time, with each utterance occupying the
  //    time it plausibly took to say rather than a single instant.
  const raw = new Array(CONTOUR_RESOLUTION).fill(0);
  const bucketMs = span / CONTOUR_RESOLUTION;
  for (const utterance of inWindow) {
    const weight = speechWeight(utterance.text);
    if (weight <= 0) continue;
    const start = at(utterance.timestamp) * CONTOUR_RESOLUTION;
    const durationMs = (weight / WORDS_PER_SECOND) * 1000;
    // Always at least one bucket: a one-word "no" is still a moment of speech.
    const width = Math.max(1, durationMs / bucketMs);
    const share = weight / width;
    for (let offset = 0; offset < width; offset += 1) {
      const bucket = Math.floor(start + offset);
      if (bucket < 0) continue;
      // `bucket` only ever increases, so running off the end means done — not
      // skip. `width` is `durationMs / bucketMs` and grows without bound as the
      // window shrinks, so with `continue` a transcript whose segments were all
      // stamped from a near-identical clock (200 utterances spanning 2ms) span
      // this loop for two seconds on the main thread. `break` caps it at 96.
      if (bucket >= CONTOUR_RESOLUTION) break;
      // The final bucket is usually a partial one.
      raw[bucket] += share * Math.min(1, width - offset);
    }
  }

  const smoothed = raw.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -SMOOTHING; offset <= SMOOTHING; offset += 1) {
      const neighbour = index + offset;
      if (neighbour < 0 || neighbour >= CONTOUR_RESOLUTION) continue;
      total += raw[neighbour];
      count += 1;
    }
    return total / count;
  });

  const peak = Math.max(...smoothed, 0);
  const points = smoothed.map((value, index) => {
    const normalized = peak > 0 ? value / peak : 0;
    return {
      x: round(index / (CONTOUR_RESOLUTION - 1)),
      y: round(normalized),
      // Marked rather than dropped: a silence in a conversation is content, and
      // the renderer draws it as a thinning of the line rather than a gap.
      quiet: normalized <= QUIET_THRESHOLD,
    };
  });

  // 2. Questions, as marks above the trace.
  const marks = questions
    .filter((card) => Number.isFinite(card?.createdAt))
    .filter((card) => card.createdAt >= firstAt && card.createdAt <= lastAt)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((card) => {
      const x = round(at(card.createdAt));
      const bucket = Math.min(CONTOUR_RESOLUTION - 1, Math.floor(x * CONTOUR_RESOLUTION));
      return {
        id: card.id ?? `q-${card.createdAt}`,
        x,
        // Sits on the line it belongs to, so a question reads as having been
        // asked *into* the conversation rather than floating over it.
        y: points[bucket]?.y ?? 0,
        state: card.state ?? "asked",
        fill: OUTCOME_FILL[card.state] ?? OUTCOME_FILL.asked,
        question: card.question ?? "",
        groupKey: card.groupKey ?? card.id ?? `q-${card.createdAt}`,
        occurrence: card.occurrence ?? 1,
      };
    });

  // 3. Topic shifts, as notches in the baseline.
  const shifts = topics
    .filter((topic) => Number.isFinite(topic?.startedAt))
    .filter((topic) => topic.startedAt > firstAt && topic.startedAt <= lastAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((topic) => ({
      id: topic.id ?? `t-${topic.startedAt}`,
      x: round(at(topic.startedAt)),
      label: topic.label ?? "",
      state: topic.state ?? "open",
    }));

  // 4. Returns — the room coming back to a thread it had left.
  //
  // This is the one thing in the contour that a transcript cannot show you and
  // a summary always flattens: it is the difference between a subject that was
  // covered and a subject that would not go away. Drawn as an arc from where
  // the thread started to where it was picked up again.
  const returns = topics
    .filter((topic) => Number.isFinite(topic?.startedAt) && Number.isFinite(topic?.lastTouchedAt))
    .filter((topic) => topic.lastTouchedAt > topic.startedAt)
    .filter((topic) => topic.startedAt >= firstAt && topic.lastTouchedAt <= lastAt)
    // A thread touched again inside its own opening moment is one continuous
    // stretch of talking, not a return to it.
    .filter((topic) => topic.lastTouchedAt - topic.startedAt > span / CONTOUR_RESOLUTION)
    .map((topic) => ({
      id: topic.id ?? `r-${topic.startedAt}`,
      from: round(at(topic.startedAt)),
      to: round(at(topic.lastTouchedAt)),
      label: topic.label ?? "",
      state: topic.state ?? "open",
    }));

  // 5. Moments somebody marked, under the baseline. Outside the window they
  //    are dropped, like speech, rather than piled onto an edge.
  const marked = (Array.isArray(moments) ? moments : [])
    .filter((moment) => Number.isFinite(moment?.at))
    .filter((moment) => moment.at >= firstAt && moment.at <= lastAt)
    .sort((a, b) => a.at - b.at)
    .map((moment) => ({
      id: moment.id ?? `m-${moment.at}`,
      x: round(at(moment.at)),
      at: moment.at,
      note: moment.note ?? "",
    }));

  return {
    points,
    marks,
    shifts,
    returns,
    moments: marked,
    span,
    start: firstAt,
    empty: false,
  };
}

/**
 * The miniature used beside a conversation in the Intelligence list.
 *
 * Same model, fewer buckets: at 40px wide a 96-point trace is a smear. Marks
 * are kept — one glance should say "this conversation had three unanswered
 * questions in its last third", which is exactly the thing worth scanning a
 * list for.
 */
export function contourStrip(contour, buckets = 24) {
  if (!contour || contour.empty || !contour.points.length) {
    return {
      points: [],
      marks: [],
      shifts: [],
      returns: [],
      moments: [],
      span: 0,
      start: 0,
      empty: true,
    };
  }
  const points = [];
  for (let index = 0; index < buckets; index += 1) {
    const from = Math.floor((index / buckets) * contour.points.length);
    const to = Math.max(from + 1, Math.floor(((index + 1) / buckets) * contour.points.length));
    const slice = contour.points.slice(from, to);
    const value = slice.reduce((total, point) => total + point.y, 0) / (slice.length || 1);
    points.push({
      x: round(index / (buckets - 1)),
      y: round(value),
      quiet: value <= QUIET_THRESHOLD,
    });
  }
  // A complete contour, not a narrower shape.
  //
  // It used to return only points and trimmed marks while every caller cast it
  // to the full type, so a `label` prop on a list row would have read
  // `.shifts.length` off `undefined` and crashed with no type error to warn
  // anybody. The notches and arcs are genuinely empty at this size — that is a
  // rendering decision, and saying so in the data is cheaper than a second type
  // that has to be kept in step.
  return {
    points,
    marks: contour.marks.map((mark) => ({ ...mark })),
    shifts: [],
    returns: [],
    moments: [],
    span: contour.span,
    start: contour.start ?? 0,
    empty: false,
  };
}

function emptyContour() {
  return {
    points: [],
    marks: [],
    shifts: [],
    returns: [],
    moments: [],
    span: 0,
    start: 0,
    empty: true,
  };
}

/** How much of a conversation the live contour shows: the last four minutes. */
export const LIVE_WINDOW_MS = 4 * 60_000;

/**
 * One bucket per second, aligned to the wall clock. A once-a-second redraw
 * then moves the trace by exactly one bucket: every second keeps its value as
 * it travels left, so the line rolls instead of shimmering as bucket edges
 * move under it.
 */
export const LIVE_BUCKET_MS = 1000;

/**
 * Words per second that fill the live contour's height. A fixed scale, not the
 * window's own peak: with the peak, the whole trace rescaled every time the
 * loudest moment rolled out of the window.
 */
const LIVE_FULL_SCALE_WPS = 3;

/** Seconds of microphone level that the level scale is learned from. */
const LEVEL_HISTORY_SECONDS = 600;

/** The p-th percentile (0..1) of a list of numbers, or 0 for none. */
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.round(p * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

/**
 * The microphone's range in this room: its quiet (20th percentile) and its
 * talking (90th), learned from the session's recent history. A fixed scale
 * draws a quiet microphone as silence and a hot one as a solid block.
 */
export function levelScale(levels) {
  const recent = (Array.isArray(levels) ? levels : [])
    .slice(-LEVEL_HISTORY_SECONDS)
    .map((sample) => sample?.level)
    .filter((level) => Number.isFinite(level));
  const floor = percentile(recent, 0.2);
  const loud = percentile(recent, 0.9);
  // A minimum range, so a session of pure room tone stays flat.
  return { floor, range: Math.max(loud - floor, 0.01) };
}

/**
 * The live contour: the last four minutes of a recording, one bucket per
 * second, with now at the right-hand edge.
 *
 * Redrawn once a second, it rolls: the trace and every mark on it move one
 * second to the left, and a mark leaves at the left edge when its question is
 * four minutes old. Two signals feed it, so the line moves while somebody is
 * still talking rather than only when a pause finalizes a segment:
 *
 *   the transcript, as words per second (with the speech still being
 *   transcribed counted as ending now), and
 *   the microphone level, as a share of this room's own range.
 *
 * Each second draws the larger of the two. The scale is fixed, so nothing
 * rescales as the loudest moment rolls away.
 *
 * @param {object} input
 * @param {Array<{ id?: string, text?: string, timestamp?: number, durationMs?: number }>} input.utterances
 *   Finalized speech. `durationMs`, when known, places it exactly.
 * @param {string[]} [input.partials] Speech still being transcribed.
 * @param {Array<{ at: number, level: number }>} [input.levels]
 *   Microphone level per second (epoch ms, 0..1), oldest first.
 * @param {Array<{ id?: string, question?: string, state?: string, createdAt?: number,
 *   groupKey?: string, occurrence?: number }>} [input.questions] Question cards.
 * @param {Array<{ id?: string, label?: string, state?: string, startedAt?: number,
 *   lastTouchedAt?: number }>} [input.topics] Topic nodes from the tracker.
 * @param {Array<{ id?: string, at?: number, note?: string }>} [input.moments]
 *   Instants somebody pressed "Mark".
 * @param {number} input.now The current time.
 * @param {number} [input.startedAt] When this sitting started. Nothing is drawn
 *   before it.
 * @param {number} [input.windowMs] How much the window shows. Four minutes.
 * @returns The same shape as `buildContour`, plus `live`, `sessionX` (where the
 *   sitting starts, below 0 once it scrolls out), `ticks` (whole minutes since
 *   the start) and `summary` (the whole sitting, for the label).
 */
export function buildLiveContour({
  utterances = [],
  partials = [],
  levels = [],
  questions = [],
  topics = [],
  moments = [],
  now,
  startedAt,
  windowMs = LIVE_WINDOW_MS,
}) {
  if (!Number.isFinite(now)) return emptyContour();
  const count = Math.max(2, Math.round(windowMs / LIVE_BUCKET_MS));
  // The window ends with the current second.
  const lastAt = Math.floor(now / LIVE_BUCKET_MS) * LIVE_BUCKET_MS + LIVE_BUCKET_MS;
  const firstAt = lastAt - count * LIVE_BUCKET_MS;
  const span = lastAt - firstAt;
  const session = Number.isFinite(startedAt) ? Math.min(startedAt, now) : firstAt;
  const xAt = (timestamp) => round((timestamp - firstAt) / span);
  const bucketOf = (timestamp) => Math.floor((timestamp - firstAt) / LIVE_BUCKET_MS);
  const before = (index) => firstAt + (index + 1) * LIVE_BUCKET_MS <= session;

  // 1. Speech from the transcript, in words per bucket.
  const words = new Array(count).fill(0);
  const spread = (startMs, weight, durationMs) => {
    if (!(weight > 0) || !(durationMs > 0)) return;
    const from = Math.max(startMs, firstAt, session);
    const to = Math.min(startMs + durationMs, lastAt);
    if (to <= from) return;
    const perMs = weight / durationMs;
    for (let index = Math.max(0, bucketOf(from)); index < count; index += 1) {
      const bucketStart = firstAt + index * LIVE_BUCKET_MS;
      if (bucketStart >= to) break;
      const overlap = Math.min(bucketStart + LIVE_BUCKET_MS, to) - Math.max(bucketStart, from);
      if (overlap > 0) words[index] += perMs * overlap;
    }
  };
  for (const utterance of Array.isArray(utterances) ? utterances : []) {
    if (!Number.isFinite(utterance?.timestamp)) continue;
    const weight = speechWeight(utterance.text);
    const durationMs =
      Number.isFinite(utterance.durationMs) && utterance.durationMs > 0
        ? utterance.durationMs
        : (weight / WORDS_PER_SECOND) * 1000;
    spread(utterance.timestamp, weight, durationMs);
  }
  // Speech still being transcribed is happening now, so it ends now.
  for (const text of Array.isArray(partials) ? partials : []) {
    const weight = speechWeight(text);
    const durationMs = (weight / WORDS_PER_SECOND) * 1000;
    spread(now - durationMs, weight, durationMs);
  }

  // 2. The microphone, as a share of the room's range.
  const { floor, range } = levelScale(levels);
  const loud = new Array(count).fill(0);
  for (const sample of Array.isArray(levels) ? levels : []) {
    if (!Number.isFinite(sample?.at) || !Number.isFinite(sample?.level)) continue;
    if (sample.at < session) continue;
    const index = bucketOf(sample.at);
    if (index < 0 || index >= count) continue;
    loud[index] = Math.max(loud[index], clamp01((sample.level - floor) / range));
  }

  // 3. The larger of the two per second, smoothed over its neighbours.
  const bucketSeconds = LIVE_BUCKET_MS / 1000;
  const combined = words.map((total, index) =>
    Math.max(clamp01(total / bucketSeconds / LIVE_FULL_SCALE_WPS), loud[index])
  );
  const points = combined.map((_, index) => {
    let total = 0;
    let used = 0;
    for (let offset = -SMOOTHING; offset <= SMOOTHING; offset += 1) {
      const neighbour = index + offset;
      if (neighbour < 0 || neighbour >= count || before(neighbour)) continue;
      total += combined[neighbour];
      used += 1;
    }
    const value = used ? total / used : 0;
    return {
      // The centre of the second, in the same time coordinates as the marks.
      x: round((index + 0.5) / count),
      y: round(value),
      quiet: value <= QUIET_THRESHOLD,
      before: before(index),
    };
  });

  const inWindow = (timestamp) =>
    Number.isFinite(timestamp) && timestamp >= Math.max(firstAt, session) && timestamp <= now;

  const marks = (Array.isArray(questions) ? questions : [])
    .filter((card) => inWindow(card?.createdAt))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((card) => {
      const index = Math.min(count - 1, Math.max(0, bucketOf(card.createdAt)));
      return {
        id: card.id ?? `q-${card.createdAt}`,
        x: xAt(card.createdAt),
        y: points[index].y,
        state: card.state ?? "asked",
        fill: OUTCOME_FILL[card.state] ?? OUTCOME_FILL.asked,
        question: card.question ?? "",
        groupKey: card.groupKey ?? card.id ?? `q-${card.createdAt}`,
        occurrence: card.occurrence ?? 1,
      };
    });

  const topicList = Array.isArray(topics) ? topics : [];
  const shifts = topicList
    .filter((topic) => inWindow(topic?.startedAt) && topic.startedAt > session)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((topic) => ({
      id: topic.id ?? `t-${topic.startedAt}`,
      x: xAt(topic.startedAt),
      label: topic.label ?? "",
      state: topic.state ?? "open",
    }));

  // An arc can start before the window: its left end is then off the canvas,
  // which is where that part of the conversation now is.
  const returns = topicList
    .filter((topic) => Number.isFinite(topic?.startedAt) && Number.isFinite(topic?.lastTouchedAt))
    .filter((topic) => topic.lastTouchedAt - topic.startedAt > LIVE_BUCKET_MS)
    .filter((topic) => topic.startedAt >= session && inWindow(topic.lastTouchedAt))
    .map((topic) => ({
      id: topic.id ?? `r-${topic.startedAt}`,
      from: xAt(topic.startedAt),
      to: xAt(topic.lastTouchedAt),
      label: topic.label ?? "",
      state: topic.state ?? "open",
    }));

  const marked = (Array.isArray(moments) ? moments : [])
    .filter((moment) => inWindow(moment?.at))
    .sort((a, b) => a.at - b.at)
    .map((moment) => ({
      id: moment.id ?? `m-${moment.at}`,
      x: xAt(moment.at),
      at: moment.at,
      note: moment.note ?? "",
    }));

  const ticks = [];
  for (let minute = 1; session + minute * 60_000 <= now; minute += 1) {
    const at = session + minute * 60_000;
    if (at >= firstAt) ticks.push({ x: xAt(at), minute });
  }

  // The label describes the whole sitting, not the four minutes on screen.
  const sitting = (Array.isArray(questions) ? questions : []).filter(
    (card) => Number.isFinite(card?.createdAt) && card.createdAt >= session && card.createdAt <= now
  );
  const summary = {
    minutes: Math.max(1, Math.round((now - session) / 60_000)),
    questions: sitting.length,
    unresolved: sitting.filter((card) =>
      ["asked", "silence", "denied"].includes(card.state ?? "asked")
    ).length,
    shifts: topicList.filter(
      (topic) => Number.isFinite(topic?.startedAt) && topic.startedAt > session
    ).length,
    returns: topicList.filter(
      (topic) =>
        Number.isFinite(topic?.startedAt) &&
        Number.isFinite(topic?.lastTouchedAt) &&
        topic.startedAt >= session &&
        topic.lastTouchedAt - topic.startedAt > LIVE_BUCKET_MS
    ).length,
  };

  return {
    points,
    marks,
    shifts,
    returns,
    moments: marked,
    span,
    start: firstAt,
    empty: false,
    live: true,
    sessionX: xAt(session),
    ticks,
    summary,
  };
}
