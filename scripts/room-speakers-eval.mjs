#!/usr/bin/env node
// How well a room conversation's lines are put on the right person, by the
// app's own code: the speech segmenter cuts the lines, a voice model embeds
// each one (kaldiFbank.mjs features), roomVoices.mjs groups them, and
// speakerTurns.mjs gives each line its speaker as the reader sees it.
//
// The truth is a transcript in the Santa Barbara Corpus's .trn format (start,
// end, SPEAKER: words). A line's person is whoever holds most of its time.
// Scored: the share of lines on the right person, under the best one-to-one
// match of groups to people (a person split in two loses the second group's
// lines); whether the reader is shown the right number of people.
//
//   node scripts/room-speakers-eval.mjs --corpus ~/oats-asr-cache/sbcsae \
//     --model 3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx --ids SBC005,SBC007
//
// The corpus directory holds wav16/<id>.wav (16 kHz mono) and trn/<id>.trn.
// Nothing leaves this computer. docs/room-speakers.md has the runs.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ort = require("onnxruntime-node");
const here = path.dirname(fileURLToPath(import.meta.url));
const { SpeechSegmenter, SAMPLE_RATE } = await import(
  path.join(here, "../src/helpers/speechSegmenter.mjs")
);
const { computeFbank, NUM_BINS } = await import(path.join(here, "../src/helpers/kaldiFbank.mjs"));
const { groupVoices } = await import(path.join(here, "../src/helpers/roomVoices.mjs"));
const { assignSpeakers } = await import(path.join(here, "../src/helpers/speakerTurns.mjs"));

function args(argv) {
  const out = { corpus: null, model: null, ids: [], json: null, minShare: 0.05 };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    if (argv[i] === "--corpus") out.corpus = next();
    else if (argv[i] === "--model") out.model = next();
    else if (argv[i] === "--ids") out.ids = next().split(",").filter(Boolean);
    else if (argv[i] === "--json") out.json = next();
    else if (argv[i] === "--people-min-share") out.minShare = Number(next());
  }
  if (!out.corpus || !out.model || !out.ids.length) {
    console.error(
      "usage: room-speakers-eval.mjs --corpus DIR --model MODEL.onnx --ids A,B [--json OUT]"
    );
    process.exit(2);
  }
  return out;
}

function readWav16(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  while (off < buf.length - 8) {
    const tag = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (tag === "fmt " && buf.readUInt32LE(off + 12) !== SAMPLE_RATE) {
      throw new Error(`${file}: not ${SAMPLE_RATE} Hz`);
    }
    if (tag === "data") {
      const data = buf.subarray(off + 8, off + 8 + size);
      return new Int16Array(data.buffer, data.byteOffset, data.length >> 1);
    }
    off += 8 + size;
  }
  throw new Error(`${file}: no data chunk`);
}

/** Santa Barbara Corpus .trn: "start end<TAB>SPEAKER:<TAB>words"; a blank speaker continues. */
function readTrn(file) {
  const turns = [];
  let speaker = null;
  for (const raw of fs.readFileSync(file, "latin1").split(/\r?\n/)) {
    const m = /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\t?\s*(.*)$/.exec(raw);
    if (!m) continue;
    let rest = m[3];
    const who = /^([>A-Z0-9_#~*-]+[A-Z0-9_]*):\s*(.*)$/.exec(rest.trim());
    if (who) [, speaker, rest] = who;
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (!(end > start) || !speaker || speaker.startsWith(">")) continue;
    // Words, not only breaths, laughter and other noises.
    const words = rest.replace(/\([^)]*\)|<[^>]*>/g, " ").replace(/[@%=[\]\d.,?!\-_~"'`:;]+/g, " ");
    if (/[a-z]{2,}/i.test(words)) turns.push({ start, end, speaker });
  }
  return turns;
}

function lines(pcm) {
  const segmenter = new SpeechSegmenter();
  const out = [];
  for (let i = 0; i < pcm.length; i += SAMPLE_RATE / 2) {
    out.push(...segmenter.push(pcm.subarray(i, Math.min(pcm.length, i + SAMPLE_RATE / 2))));
  }
  out.push(...segmenter.flush());
  return out.map((s, n) => ({ id: String(n), startMs: s.startMs, endMs: s.endMs }));
}

async function embed(session, pcm, line) {
  let a = line.startMs / 1000;
  let b = line.endMs / 1000;
  if (b - a < 0.5) return null;
  if (b - a > 8) [a, b] = [(a + b) / 2 - 4, (a + b) / 2 + 4];
  const from = Math.floor(a * SAMPLE_RATE);
  const samples = new Float32Array(Math.floor(b * SAMPLE_RATE) - from);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm[from + i] / 32768;
  const { features, numFrames } = computeFbank(samples);
  const input = session.inputNames[0];
  const out = await session.run({
    [input]: new ort.Tensor("float32", features, [1, numFrames, NUM_BINS]),
  });
  return Float32Array.from(out[session.outputNames[0]].data);
}

function score(segments, assignments, truth, minShare) {
  const time = new Map();
  for (const t of truth) time.set(t.speaker, (time.get(t.speaker) ?? 0) + t.end - t.start);
  const total = [...time.values()].reduce((a, b) => a + b, 0);
  const people = [...time]
    .sort((a, b) => b[1] - a[1])
    .filter(([, t]) => t / total >= minShare)
    .map(([s]) => s);
  const scored = [];
  for (const s of segments) {
    const share = new Map();
    let speech = 0;
    for (const t of truth) {
      const o = Math.min(s.endMs, t.end * 1000) - Math.max(s.startMs, t.start * 1000);
      if (o > 0) {
        share.set(t.speaker, (share.get(t.speaker) ?? 0) + o);
        speech += o;
      }
    }
    if (!speech) continue;
    const [who, ms] = [...share].sort((a, b) => b[1] - a[1])[0];
    if (ms < 0.5 * (s.endMs - s.startMs) && ms < 0.5 * speech) continue;
    scored.push({
      who: people.includes(who) ? who : "other",
      label: assignments.get(s.id) ?? null,
    });
  }
  const labels = [...new Set(scored.map((x) => x.label).filter(Boolean))];
  let best = 0;
  let bestMap = new Map();
  const search = (i, used, map, right) => {
    if (i === labels.length) {
      if (right > best) [best, bestMap] = [right, new Map(map)];
      return;
    }
    search(i + 1, used, map, right);
    for (const p of people) {
      if (used.has(p)) continue;
      used.add(p);
      map.set(labels[i], p);
      search(
        i + 1,
        used,
        map,
        right + scored.filter((x) => x.label === labels[i] && x.who === p).length
      );
      used.delete(p);
      map.delete(labels[i]);
    }
  };
  search(0, new Set(), new Map(), 0);
  const unlabeled = scored.filter((x) => !x.label).length;
  return {
    people: people.length,
    lines: scored.length,
    right: best / scored.length,
    unlabeled: unlabeled / scored.length,
    wrong: (scored.length - best - unlabeled) / scored.length,
  };
}

const opts = args(process.argv.slice(2));
const session = await ort.InferenceSession.create(opts.model, { intraOpNumThreads: 1 });
const rows = [];
for (const id of opts.ids) {
  const pcm = readWav16(path.join(opts.corpus, "wav16", `${id}.wav`));
  const segments = lines(pcm);
  const started = performance.now();
  const withVoices = [];
  for (const s of segments) withVoices.push({ ...s, embedding: await embed(session, pcm, s) });
  const embedMs = performance.now() - started;
  const groupStart = performance.now();
  const turns = groupVoices(withVoices);
  const groupMs = performance.now() - groupStart;
  const { assignments, speakers } = assignSpeakers(segments, turns);
  const result = score(
    segments,
    assignments,
    readTrn(path.join(opts.corpus, "trn", `${id}.trn`)),
    opts.minShare
  );
  const row = {
    id,
    ...result,
    shown: speakers.length,
    embedMs: Math.round(embedMs / segments.length),
    groupMs: Math.round(groupMs),
  };
  rows.push(row);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log(
    `${id}\tpeople=${row.people} shown=${row.shown}\tlines=${row.lines}\tright=${pct(row.right)}\twrong=${pct(row.wrong)}\tunlabeled=${pct(row.unlabeled)}\t${row.embedMs} ms a line, grouping ${row.groupMs} ms`
  );
}
const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log(
  // One person is shown as no label at all (speakerTurns.mjs).
  `MEAN over ${rows.length}\tright count ${rows.filter((r) => r.shown === r.people || (r.people === 1 && r.shown === 0)).length}/${rows.length}\tright=${(mean("right") * 100).toFixed(1)}%\twrong=${(mean("wrong") * 100).toFixed(1)}%\tunlabeled=${(mean("unlabeled") * 100).toFixed(1)}%`
);
if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(rows, null, 2));
