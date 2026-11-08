#!/usr/bin/env node
/**
 * Two `room-replay.js --json` runs on the same recordings, side by side: each
 * share, its difference, and a 95% bootstrap interval over the recordings
 * (10,000 resamples, seeded, a recording's counts kept whole). Then the phrases
 * each run invented, and how often it asked a question.
 *
 *   node scripts/room-compare.js --base a.json --run b.json [--ami <annotations>]
 *        [--others c.json,d.json] [--json out.json]
 *
 * An invented phrase is round 1's "text where nobody spoke": a segment with no
 * reference speech that came back with words, and no run in `--others` wrote
 * any of those words in that stretch. AMI leaves the talk before and after a
 * meeting untranscribed, so words another recognizer also heard there are
 * speech the reference does not have. Keep `--others` to other architectures:
 * Whisper models share their phantom "Thank you."
 */

const fs = require("fs");
const path = require("path");
const { normalise, merge, covered, loadAmi } = require("./room-replay.js");

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};
/**
 * A run: a `--json` file, or a `--publish` directory of recordings, or several
 * of those joined by `+` (the same model on more meetings).
 */
function load(spec) {
  const recordings = [];
  for (const part of spec.split("+")) {
    if (fs.statSync(part).isDirectory()) {
      for (const name of fs.readdirSync(part).sort()) {
        if (!name.endsWith(".json")) continue;
        const one = JSON.parse(fs.readFileSync(path.join(part, name), "utf8"));
        recordings.push({ summary: one.metrics, segments: one.segments });
      }
    } else {
      recordings.push(...JSON.parse(fs.readFileSync(part, "utf8")).recordings);
    }
  }
  return { recordings };
}

const BASE = arg("base");
const RUN = arg("run");
const AMI = arg("ami");
const OTHERS = (arg("others", "") || "").split(",").filter(Boolean);
if (!BASE || !RUN) {
  console.error("usage: node scripts/room-compare.js --base a.json --run b.json");
  process.exit(2);
}

/** A small seeded generator: the same interval from the same runs. */
function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The share each run gets, per recording, as [part, whole] pairs. */
const METRICS = {
  content: (r) => [r.matterCounts.content.heard, r.matterCounts.content.words],
  words: (r) => [r.heard, r.words],
  numbers: (r) => [r.matterCounts.numbers.heard, r.matterCounts.numbers.words],
  names: (r) => [r.matterCounts.names.heard, r.matterCounts.names.words],
  contentPrecision: (r) => [
    r.matterCounts.transcriptContent.matched,
    r.matterCounts.transcriptContent.words,
  ],
  wer: (r) => [r.substitutions + r.deletions + r.insertions, r.words],
};

function pooled(pairs) {
  const part = pairs.reduce((n, [a]) => n + a, 0);
  const whole = pairs.reduce((n, [, b]) => n + b, 0);
  return whole ? (100 * part) / whole : NaN;
}

function compare(a, b) {
  const meetings = a.recordings.map((r) => r.summary.meeting);
  const inB = new Map(b.recordings.map((r) => [r.summary.meeting, r.summary.reference]));
  const shared = meetings.filter((m) => inB.has(m));
  const inA = new Map(a.recordings.map((r) => [r.summary.meeting, r.summary.reference]));
  const out = { meetings: shared };
  for (const [name, pick] of Object.entries(METRICS)) {
    const pa = shared.map((m) => pick(inA.get(m)));
    const pb = shared.map((m) => pick(inB.get(m)));
    const rand = random(20261105);
    const samples = [];
    for (let i = 0; i < 10_000; i += 1) {
      const ra = [];
      const rb = [];
      for (let k = 0; k < shared.length; k += 1) {
        const at = Math.floor(rand() * shared.length);
        ra.push(pa[at]);
        rb.push(pb[at]);
      }
      samples.push(pooled(rb) - pooled(ra));
    }
    samples.sort((x, y) => x - y);
    const better = shared.filter((_, k) => {
      const d = pb[k][0] / pb[k][1] - pa[k][0] / pa[k][1];
      return name === "wer" ? d < 0 : d > 0;
    }).length;
    out[name] = {
      base: Number(pooled(pa).toFixed(1)),
      run: Number(pooled(pb).toFixed(1)),
      difference: Number((pooled(pb) - pooled(pa)).toFixed(2)),
      low: Number(samples[250].toFixed(2)),
      high: Number(samples[9750].toFixed(2)),
      better,
    };
  }
  return out;
}

/** The segments with no reference speech in them, as `room-replay.js` finds them. */
function noSpeechSegments(run, meeting) {
  const { words } = loadAmi(AMI, meeting);
  const speech = merge(words.map((w) => [w.start - 0.05, w.end + 0.05]));
  const recording = run.recordings.find((r) => r.summary.meeting === meeting);
  return recording.segments.filter((s) => covered(s.start, s.end, speech) < 0.05);
}

/** Invented phrases of `run`, against `others` (runs of the same meetings). */
function invented(run, others) {
  const out = { noSpeechWithWords: 0, heardElsewhere: 0, invented: 0, examples: [] };
  let seconds = 0;
  for (const recording of run.recordings) {
    const meeting = recording.summary.meeting;
    seconds += recording.summary.seconds;
    for (const s of noSpeechSegments(run, meeting)) {
      const said = normalise(s.text);
      if (!said.length) continue;
      out.noSpeechWithWords += 1;
      const elsewhere = others.some((other) => {
        const r = other.recordings.find((x) => x.summary.meeting === meeting);
        return r?.segments.some(
          (t) =>
            t.text &&
            t.start < s.end + 1 &&
            t.end > s.start - 1 &&
            normalise(t.text).some((w) => said.includes(w))
        );
      });
      if (elsewhere) out.heardElsewhere += 1;
      else {
        out.invented += 1;
        if (out.examples.length < 8) out.examples.push(s.text);
      }
    }
  }
  out.perHour = Number(((out.invented * 3600) / (seconds || 1)).toFixed(2));
  return out;
}

/** When the reference puts a question mark, in one meeting (AMI marks them as words). */
function referenceQuestions(meeting) {
  const dir = path.join(AMI, "words");
  const times = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.startsWith(`${meeting}.`) || !file.endsWith(".words.xml")) continue;
    const xml = fs.readFileSync(path.join(dir, file), "latin1");
    for (const [tag] of xml.matchAll(/<w\b[^>]*punc="true"[^>]*>\?<\/w>/g)) {
      const at = Number(/starttime="([^"]+)"/.exec(tag)?.[1]);
      if (Number.isFinite(at)) times.push(at);
    }
  }
  return times.sort((a, b) => a - b);
}

/**
 * Question marks against the reference's, by segment: a transcript's "?" is
 * right when its segment holds one of the reference's (half a second of
 * margin), and a reference "?" is heard when a segment with a "?" holds it.
 */
function questionMarks(run) {
  let written = 0;
  let right = 0;
  let reference = 0;
  let heard = 0;
  for (const recording of run.recordings) {
    const times = referenceQuestions(recording.summary.meeting);
    reference += times.length;
    const marked = recording.segments.filter((s) => /\?/.test(s.text ?? ""));
    written += marked.length;
    for (const s of marked) {
      if (times.some((t) => t >= s.start - 0.5 && t <= s.end + 0.5)) right += 1;
    }
    for (const t of times) {
      if (marked.some((s) => t >= s.start - 0.5 && t <= s.end + 0.5)) heard += 1;
    }
  }
  return {
    segmentsWithMark: written,
    precision: Number(((100 * right) / (written || 1)).toFixed(1)),
    reference,
    recall: Number(((100 * heard) / (reference || 1)).toFixed(1)),
  };
}

/** How a run writes: questions and sentences per 1,000 words. */
function style(run) {
  let words = 0;
  let questions = 0;
  let stops = 0;
  for (const recording of run.recordings) {
    for (const s of recording.segments) {
      words += normalise(s.text).length;
      questions += (String(s.text ?? "").match(/\?/g) ?? []).length;
      stops += (String(s.text ?? "").match(/[.!?](\s|$)/g) ?? []).length;
    }
  }
  return {
    questionsPer1k: Number(((1000 * questions) / (words || 1)).toFixed(2)),
    sentencesPer1k: Number(((1000 * stops) / (words || 1)).toFixed(1)),
  };
}

const a = load(BASE);
const b = load(RUN);
const result = compare(a, b);
result.style = { base: style(a), run: style(b) };
if (AMI) {
  const others = OTHERS.map(load);
  result.invented = { base: invented(a, others), run: invented(b, others) };
  result.questionMarks = { base: questionMarks(a), run: questionMarks(b) };
}
const row = (name) => {
  const m = result[name];
  return `${name.padEnd(17)} ${String(m.base).padStart(6)} ${String(m.run).padStart(6)}  ${String(m.difference).padStart(6)}  [${m.low}, ${m.high}]  ${m.better}/${result.meetings.length} better`;
};
console.log(Object.keys(METRICS).map(row).join("\n"));
console.log(`style ${JSON.stringify(result.style)}`);
if (result.invented) {
  const { base, run } = result.invented;
  console.log(
    `invented per hour: ${base.perHour} -> ${run.perHour} (${base.invented} -> ${run.invented}; heard elsewhere ${base.heardElsewhere} -> ${run.heardElsewhere})`
  );
  console.log(`  examples: ${JSON.stringify(run.examples)}`);
  console.log(`question marks ${JSON.stringify(result.questionMarks)}`);
}
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(result, null, 1));
