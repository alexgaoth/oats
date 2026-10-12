const test = require("node:test");
const assert = require("node:assert/strict");

// A pure `.mjs` helper reached through a dynamic import, like
// conversationContour.test.js.
let AudioClock, speechChanges, TranscriptLag, LAG_DEFAULTS;

test.before(async () => {
  ({ AudioClock, speechChanges, TranscriptLag, LAG_DEFAULTS } =
    await import("../../src/helpers/transcriptLag.mjs"));
});

const T0 = 1_700_000_000_000;
const at = (seconds) => T0 + Math.round(seconds * 1000);

// ---------------------------------------------------------------- main side

test("a sample is heard when its chunk reached main, counted back at the sample rate", () => {
  const clock = new AudioClock(16000);
  assert.equal(clock.wallAt(0), null, "nothing before any audio");
  // One second of audio in 30 ms chunks, arriving in real time.
  for (let chunk = 1; chunk <= 33; chunk += 1) clock.arrived(480, at(chunk * 0.03));
  assert.equal(clock.samples, 33 * 480);
  // The newest sample was heard as it arrived; one 480 back, 30 ms earlier.
  assert.equal(clock.wallAt(33 * 480), at(0.99));
  assert.equal(clock.wallAt(32 * 480), at(0.96));
});

test("buffered audio arriving in a burst can only make moments later, never earlier", () => {
  // Two seconds were captured before main took any; they arrive at once at 2 s.
  const burst = new AudioClock(16000);
  burst.arrived(32000, at(2));
  const steady = new AudioClock(16000);
  for (let ms = 100; ms <= 2000; ms += 100) steady.arrived(1600, at(ms / 1000));
  for (const sample of [0, 8000, 16000, 32000]) {
    assert.ok(burst.wallAt(sample) >= steady.wallAt(sample), `sample ${sample}`);
  }
});

const seg = (startSample, endSample) => ({ startSample, endSample });
const open = (startSample) => ({ startSample });

test("speech changes: start, go on, stop", () => {
  assert.deepEqual(speechChanges(null, [], null), []);
  assert.deepEqual(speechChanges(null, [], open(800)), [{ speaking: true, sample: 800 }]);
  assert.deepEqual(speechChanges(800, [], open(800)), []);
  assert.deepEqual(speechChanges(800, [seg(800, 40000)], null), [
    { speaking: false, sample: 40000 },
  ]);
});

test("speech changes: a turn cut at the 20 s cap is not a stop", () => {
  assert.deepEqual(speechChanges(800, [seg(800, 320800)], open(320800)), []);
});

test("speech changes: a cough the segmenter drops is dropped here too", () => {
  assert.deepEqual(speechChanges(800, [], null), [
    { speaking: false, sample: null, dropped: true },
  ]);
  // And straight into a new turn in the same chunk.
  assert.deepEqual(speechChanges(800, [], open(9600)), [
    { speaking: false, sample: null, dropped: true },
    { speaking: true, sample: 9600 },
  ]);
});

test("speech changes: a stop and a new start in one chunk, and the flush at Stop", () => {
  assert.deepEqual(speechChanges(800, [seg(800, 40000)], open(40320)), [
    { speaking: false, sample: 40000 },
    { speaking: true, sample: 40320 },
  ]);
  assert.deepEqual(speechChanges(null, [seg(800, 9600)], null), [
    { speaking: true, sample: 800 },
    { speaking: false, sample: 9600 },
  ]);
});

// ------------------------------------------------------------ renderer side

/**
 * Plays a timeline into a TranscriptLag, reading the badge once a second as
 * the component does. `events` are [seconds, kind, value] in time order:
 *   ["speech", start] / ["stop", end] / ["drop"] / ["text", audioEndedAt].
 * Returns the badge at every whole second.
 */
function play(events, { until, lag = new TranscriptLag() } = {}) {
  const reads = [];
  let next = 0;
  for (let second = 0; second <= until; second += 1) {
    while (next < events.length && events[next][0] <= second) {
      const [, kind, value] = events[next];
      if (kind === "speech") lag.speech({ speaking: true, at: at(value) });
      if (kind === "stop") lag.speech({ speaking: false, at: at(value) });
      if (kind === "drop") lag.speech({ speaking: false, at: null, dropped: true });
      if (kind === "text") lag.text({ audioEndedAt: at(value) });
      next += 1;
    }
    reads.push({ second, ...lag.read(at(second)) });
  }
  return reads;
}

/** Continuous talk from `from` to `to`, with a partial every `every` s, `latency` s late. */
function talk(from, to, { every = 1.2, latency = 0.3, firstAfter = 1 } = {}) {
  const events = [[from, "speech", from]];
  for (let t = from + firstAfter; t + latency < to; t += every) {
    events.push([t + latency, "text", t]);
  }
  events.push([to + 0.4, "stop", to]);
  // The final, shortly after the segmenter closes the turn.
  events.push([to + 0.6, "text", to + 0.1]);
  return events;
}

const sorted = (events) => [...events].sort((a, b) => a[0] - b[0]);

test("nothing measured, nothing shown: a cloud provider or Parakeet", () => {
  const lag = new TranscriptLag();
  for (let second = 0; second < 60; second += 1) {
    assert.deepEqual(lag.read(at(second)), { visible: false, behindMs: 0, warning: false });
  }
});

test("text that keeps up shows nothing", () => {
  // Two minutes of talk in four turns, partials every 1.2 s, 0.3 s late.
  const events = sorted([...talk(0, 28), ...talk(30, 58), ...talk(60, 88), ...talk(90, 118)]);
  const reads = play(events, { until: 125 });
  assert.ok(
    reads.every((read) => !read.visible),
    `shown at ${reads.filter((r) => r.visible).map((r) => r.second)}`
  );
});

test("text that falls behind shows how far, and warns past 5 s", () => {
  // Partials keep up for ten seconds, then the server stops answering while
  // the person keeps talking.
  const events = sorted(talk(0, 40).filter(([time, kind]) => kind !== "text" || time < 10));
  const reads = play(events, { until: 40 });
  const firstShown = reads.find((read) => read.visible);
  assert.ok(firstShown, "it shows");
  assert.ok(firstShown.second >= 12 && firstShown.second <= 15, `shown at ${firstShown.second}`);
  assert.ok(firstShown.behindMs >= LAG_DEFAULTS.showAtMs);
  // While the talk goes on, the number grows.
  const later = reads.find((read) => read.second === 25);
  assert.ok(later.visible && later.warning, "orange well past 5 s");
  assert.ok(later.behindMs > 10_000 && later.behindMs < 16_000, `${later.behindMs} ms at 25 s`);
});

test("a silence cannot make it grow, and nothing appears in one", () => {
  // Talk for 6 s with no text at all (a slow first final), then 20 s of quiet.
  const lag = new TranscriptLag();
  lag.speech({ speaking: true, at: at(0) });
  lag.speech({ speaking: false, at: at(6) });
  const quiet = [];
  for (let second = 6; second <= 26; second += 1) quiet.push(lag.read(at(second)).behindMs);
  for (let i = 1; i < quiet.length; i += 1) assert.ok(quiet[i] <= quiet[i - 1], `${quiet}`);
  assert.equal(lag.read(at(27)).visible, false);
  // The raw lag is the six seconds of speech still owed, not the time since.
  assert.equal(lag.pendingMs(at(26)), 6000);
});

test("a final that lands in the pause after its turn is not lag", () => {
  // No partials at all; each turn's final arrives 0.9 s after it ends.
  const events = [];
  for (const [from, to] of [
    [0, 2],
    [3, 4.5],
    [6, 7.6],
    [9, 10.5],
  ]) {
    events.push([from, "speech", from], [to + 0.4, "stop", to], [to + 0.9, "text", to + 0.1]);
  }
  const reads = play(sorted(events), { until: 20 });
  assert.ok(reads.every((read) => !read.visible));
});

test("the moment text arrives mid-speech, the lag is its arrival minus its audio end", () => {
  const lag = new TranscriptLag();
  lag.speech({ speaking: true, at: at(0) });
  lag.text({ audioEndedAt: at(4.1) });
  assert.equal(lag.pendingMs(at(7.3)), 3200);
  // A newer text covers more; an older one, arriving late, covers nothing new.
  lag.text({ audioEndedAt: at(7.0) });
  lag.text({ audioEndedAt: at(5.0) });
  assert.equal(lag.pendingMs(at(7.3)), 300);
});

test("a dropped cough leaves nothing owed, and a final with no words settles its audio", () => {
  const lag = new TranscriptLag();
  lag.speech({ speaking: true, at: at(0) });
  lag.speech({ speaking: false, at: null, dropped: true });
  assert.equal(lag.pendingMs(at(30)), 0);
  lag.speech({ speaking: true, at: at(40) });
  lag.speech({ speaking: false, at: at(44) });
  assert.equal(lag.pendingMs(at(50)), 4000);
  // Whisper heard nothing in it: main still sends where its audio ended.
  lag.text({ audioEndedAt: at(44.1) });
  assert.equal(lag.pendingMs(at(50)), 0);
});

test("it does not flicker around the threshold", () => {
  // A server just too slow: partials every 1.6 s, each 1.2 s late, so the lag
  // swings between about 1.2 s and 2.8 s for a whole minute of talk.
  const reads = play(sorted(talk(0, 60, { every: 1.6, latency: 1.2 })), { until: 62 });
  let flips = 0;
  for (let i = 1; i < reads.length; i += 1)
    if (reads[i].visible !== reads[i - 1].visible) flips += 1;
  assert.ok(flips <= 2, `${flips} flips`);
});

test("it goes once the text has caught up", () => {
  const events = sorted([
    ...talk(0, 30).filter(([time, kind]) => kind !== "text" || time < 5 || time > 20),
  ]);
  const reads = play(events, { until: 34 });
  assert.ok(reads.find((read) => read.second === 19).visible, "behind at 19 s");
  const gone = reads.find((read) => read.second > 20 && !read.visible);
  assert.ok(gone && gone.second <= 24, `hidden again at ${gone?.second}`);
});

test("when main stops measuring, the badge stops for the rest of the recording", () => {
  const lag = new TranscriptLag();
  lag.speech({ speaking: true, at: at(0) });
  lag.off();
  lag.speech({ speaking: true, at: at(10) });
  lag.text({ audioEndedAt: at(1) });
  for (let second = 0; second < 40; second += 1) assert.equal(lag.read(at(second)).visible, false);
  // A new recording measures again.
  lag.reset();
  lag.speech({ speaking: true, at: at(100) });
  assert.equal(lag.pendingMs(at(103)), 3000);
});

// ------------------------------------------- main and renderer, end to end

test("the segmenter's own turns, through main's clock, are the speech the lag counts", async () => {
  const { SpeechSegmenter, SAMPLE_RATE } = await import("../../src/helpers/speechSegmenter.mjs");
  // Deterministic noise, as in speechSegmenter.test.js.
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const pieces = [
    ["quiet", 1.5],
    ["speech", 3],
    ["quiet", 1.5],
    ["click", 0.15],
    ["quiet", 1.5],
    ["speech", 24],
    ["quiet", 1.5],
  ];
  const total = pieces.reduce((n, [, s]) => n + Math.round(s * SAMPLE_RATE), 0);
  const audio = new Int16Array(total);
  let filled = 0;
  for (const [kind, seconds] of pieces) {
    const n = Math.round(seconds * SAMPLE_RATE);
    for (let i = 0; i < n; i += 1) {
      const syllable = Math.abs(Math.sin((Math.PI * 4 * i) / SAMPLE_RATE));
      const tone = 0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) + 0.02 * noise();
      const voice = kind === "speech" ? syllable * tone : kind === "click" ? tone : 0;
      audio[filled + i] = Math.round((0.002 * noise() + voice) * 32767);
    }
    filled += n;
  }

  // Main: 533 samples (a renderer chunk) at a time, each arriving 20 ms after
  // its last sample was spoken.
  const segmenter = new SpeechSegmenter();
  const clock = new AudioClock(SAMPLE_RATE);
  const lag = new TranscriptLag();
  let open = null;
  const cuts = [];
  for (let i = 0; i < audio.length; i += 533) {
    const chunk = audio.subarray(i, i + 533);
    const closed = segmenter.push(chunk);
    clock.arrived(chunk.length, T0 + Math.round(((i + chunk.length) / SAMPLE_RATE) * 1000) + 20);
    cuts.push(...closed);
    const now = segmenter.open;
    for (const change of speechChanges(open, closed, now)) {
      lag.speech({
        speaking: change.speaking,
        at: clock.wallAt(change.sample),
        dropped: change.dropped,
      });
    }
    open = now ? now.startSample : null;
  }

  // Two turns, the second cut once at the 20 s cap: three segments, and the
  // click is not among them.
  assert.equal(cuts.length, 3);
  // The renderer saw two runs of speech: the click came and went, and the cap
  // did not stop the long turn.
  assert.equal(lag.runs.length, 2);
  const [first, second] = lag.runs;
  // Each within the segmenter's lead-in and tail of the truth, and 20 ms late
  // at most, never early.
  assert.ok(first.start - at(1.5) >= -200 && first.start - at(1.5) <= 40, `${first.start - T0}`);
  assert.ok(first.end - at(4.5) >= -40 && first.end - at(4.5) <= 140, `${first.end - T0}`);
  assert.ok(
    second.start - at(7.65) >= -200 && second.start - at(7.65) <= 40,
    `${second.start - T0}`
  );
  assert.ok(second.end - at(31.65) >= -40 && second.end - at(31.65) <= 140, `${second.end - T0}`);
  // With no text at all, the lag is the speech: about 27 s, not the 33 s of
  // recording, and not a moment more after it.
  const owed = lag.pendingMs(at(40));
  assert.ok(owed > 26_500 && owed < 27_800, `${owed} ms owed`);
  assert.equal(lag.pendingMs(at(60)), owed);
});
