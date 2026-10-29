const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const WhisperServerManager = require("../../src/helpers/whisperServer");

let ROOM_DENOISE, roomDenoiseFilter, segmentFloorDb, SpeechSegmenter;

test.before(async () => {
  ({ ROOM_DENOISE, roomDenoiseFilter, segmentFloorDb } =
    await import("../../src/helpers/roomSegmentAudio.mjs"));
  ({ SpeechSegmenter } = await import("../../src/helpers/speechSegmenter.mjs"));
});

// A room with steady sound: the segmenter's steady floor at -41 dBFS or over.
const LOUD_ROOM = 0.012;

const RATE = 16000;
let seed = 3;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/** `[seconds, rms]` pieces of noise at that RMS (0..1 of full scale): a room, then a voice. */
function audio(pieces) {
  const out = [];
  for (const [seconds, rms] of pieces) {
    // Uniform noise in [-a, a] has an RMS of a / sqrt(3).
    const a = rms * Math.sqrt(3) * 32767;
    for (let i = 0; i < Math.round(seconds * RATE); i += 1) out.push(Math.round(a * noise()));
  }
  return Int16Array.from(out);
}

const db = (rms) => 20 * Math.log10(rms);

test("a segment's floor is its room, not its speech", () => {
  // 0.3 s of a fan at -40 dBFS, then a second of a voice 16 dB over it, then a pause.
  const fan = 0.01;
  const floor = segmentFloorDb(
    audio([
      [0.3, fan],
      [1, 0.063],
      [0.4, fan],
    ])
  );
  assert.ok(Math.abs(floor - db(fan)) < 1, `floor ${floor.toFixed(1)} dB`);
});

test("in a loud room afftdn is set to the segment's own floor", () => {
  const fan = roomDenoiseFilter(
    audio([
      [0.3, 0.01],
      [1, 0.063],
      [0.4, 0.01],
    ]),
    LOUD_ROOM
  );
  assert.match(fan, /^afftdn=nf=-(39|40)$/);
});

test("a quiet room or a quiet microphone is sent as it is", () => {
  const speech = audio([
    [0.3, 0.001],
    [1, 0.0063],
    [0.4, 0.001],
  ]);
  // The quiet room's steady floor stayed under -41 dBFS for 98% of its
  // segments, the quiet microphone's for all of them: there afftdn cost
  // content words.
  assert.equal(roomDenoiseFilter(speech, 0.008), null);
  assert.equal(roomDenoiseFilter(speech, 0.001), null);
  // A room the segmenter does not know yet is not a loud one.
  assert.equal(roomDenoiseFilter(speech, null), null);
});

test("afftdn's range holds, and a segment too short to tell is sent as it is", () => {
  assert.equal(roomDenoiseFilter(new Int16Array(RATE), LOUD_ROOM), "afftdn=nf=-80");
  assert.equal(roomDenoiseFilter(audio([[1, 0.5]]), LOUD_ROOM), "afftdn=nf=-20");
  assert.equal(roomDenoiseFilter(audio([[0.1, 0.01]]), LOUD_ROOM), null);
});

test("a segment carries the room's steady floor it closed in", () => {
  const segmenter = new SpeechSegmenter();
  // Two seconds of a fan at -38 dBFS, a second of a voice over it, a pause.
  const closed = [
    ...segmenter.push(
      audio([
        [2, 0.0125],
        [1, 0.1],
        [1, 0.0125],
      ])
    ),
    ...segmenter.flush(),
  ];
  assert.ok(closed.length >= 1);
  for (const segment of closed) {
    const floor = db(segment.steadyFloor);
    assert.ok(Math.abs(floor - db(0.0125)) < 1.5, `steady floor ${floor.toFixed(1)} dB`);
    assert.ok(roomDenoiseFilter(segment.samples, segment.steadyFloor));
  }
});

test("busy talk in a quiet room does not make it a loud one", () => {
  const segmenter = new SpeechSegmenter();
  // Five seconds of a quiet room at -54 dBFS, then fifteen of talk with no
  // pause: the floor of the last 10 s rises into the talk itself.
  const closed = [
    ...segmenter.push(
      audio([
        [5, 0.002],
        [15, 0.05],
      ])
    ),
  ];
  assert.ok(
    segmenter.floor > ROOM_DENOISE.minSteadyFloor,
    `floor ${db(segmenter.floor).toFixed(1)} dB`
  );
  assert.ok(segmenter.steadyFloor < 0.003, `steady ${db(segmenter.steadyFloor).toFixed(1)} dB`);
  closed.push(...segmenter.flush());
  assert.ok(closed.length >= 1);
  for (const segment of closed)
    assert.equal(roomDenoiseFilter(segment.samples, segment.steadyFloor), null);
});

test("a room is loud once its sound has not stopped for a minute", () => {
  const segmenter = new SpeechSegmenter();
  // A quiet room; then a fan at -38 dBFS starts, and someone speaks over it.
  segmenter.push(audio([[5, 0.002]]));
  segmenter.push(audio([[30, 0.0125]]));
  assert.ok(segmenter.steadyFloor < ROOM_DENOISE.minSteadyFloor, "not after half a minute");
  segmenter.push(audio([[45, 0.0125]]));
  const closed = [
    ...segmenter.push(
      audio([
        [1, 0.1],
        [1, 0.0125],
      ])
    ),
    ...segmenter.flush(),
  ];
  assert.ok(closed.length >= 1);
  for (const segment of closed) assert.ok(roomDenoiseFilter(segment.samples, segment.steadyFloor));
});

test("the filter reaches the server's FFmpeg conversion; dictation sends none", async (t) => {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "hello" }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const manager = new WhisperServerManager();
  Object.assign(manager, {
    ready: true,
    hostname: "127.0.0.1",
    port: server.address().port,
    canConvert: true,
    process: {},
  });
  const filters = [];
  manager._convertToWav = async (buffer, filter) => {
    filters.push(filter);
    return buffer;
  };
  await manager.transcribe(Buffer.from("audio"), { audioFilter: "afftdn=nf=-39" });
  await manager.transcribe(Buffer.from("audio"), { language: "en" });
  assert.deepEqual(filters, ["afftdn=nf=-39", null]);
});
