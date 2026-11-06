const test = require("node:test");
const assert = require("node:assert/strict");

const { ParakeetAne, isSupportedMac, pcmFromWav } = require("../../src/helpers/parakeetAne");

/** A fake helper: a Node script on the same protocol, so nothing here needs a Mac. */
const FAKE = String.raw`
const readline = require("readline");
const say = (o) => process.stdout.write(JSON.stringify(o) + "\n");
say({ ready: true });
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, pcm, keepFrom } = JSON.parse(line);
  const audio = Buffer.from(pcm, "base64");
  if (keepFrom !== undefined) return say({ id, text: audio.length + " bytes from " + keepFrom });
  if (audio.length === 0) return say({ id, error: "no audio" });
  if (audio[0] === 9) process.exit(4);
  say({ id, text: audio.length + " bytes" });
});
`;

function fake() {
  return new ParakeetAne("/models", { command: process.execPath, args: ["-e", FAKE, "--"] });
}

function wav(pcm, extraChunk = Buffer.alloc(0)) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + extraChunk.length + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header.subarray(0, 36), extraChunk, header.subarray(36, 44), pcm]);
}

test("the Neural Engine path needs Apple Silicon and macOS 14", () => {
  const mac = { platform: "darwin", arch: "arm64" };
  assert.equal(isSupportedMac({ ...mac, darwinMajor: 23 }), true);
  assert.equal(isSupportedMac({ ...mac, darwinMajor: 25 }), true);
  assert.equal(isSupportedMac({ ...mac, darwinMajor: 22 }), false);
  assert.equal(isSupportedMac({ ...mac, arch: "x64", darwinMajor: 25 }), false);
  assert.equal(isSupportedMac({ platform: "linux", arch: "arm64", darwinMajor: 25 }), false);
});

test("a WAV's samples are found past any chunk before them", () => {
  const pcm = Buffer.from([1, 2, 3, 4]);
  assert.deepEqual(pcmFromWav(wav(pcm)), pcm);
  const list = Buffer.concat([Buffer.from("LIST"), Buffer.from([3, 0, 0, 0, 7, 7, 7, 0])]);
  assert.deepEqual(pcmFromWav(wav(pcm, list)), pcm);
  assert.throws(() => pcmFromWav(Buffer.alloc(44)), /no data chunk/);
});

test("segments are answered by id, on one helper", async () => {
  const ane = fake();
  const [a, b] = await Promise.all([
    ane.transcribe(wav(Buffer.from([1, 2]))),
    ane.transcribe(wav(Buffer.from([1, 2, 3, 4]))),
  ]);
  assert.equal(a, "2 bytes");
  assert.equal(b, "4 bytes");
  assert.equal(ane.isRunning(), true);
  await ane.stop();
  assert.equal(ane.isRunning(), false);
});

test("the audio before a segment goes with it, and says where the segment starts", async () => {
  const ane = fake();
  const before = Buffer.alloc(16000 * 2 * 2);
  assert.equal(await ane.transcribe(wav(Buffer.from([1, 2])), before), "64002 bytes from 2");
  await ane.stop();
});

test("an error for one segment does not stop the helper", async () => {
  const ane = fake();
  await assert.rejects(ane.transcribe(wav(Buffer.alloc(0))), /no audio/);
  assert.equal(await ane.transcribe(wav(Buffer.from([1, 2]))), "2 bytes");
  await ane.stop();
});

test("a helper that dies fails its reads, and the next read starts a new one", async () => {
  const ane = fake();
  await assert.rejects(ane.transcribe(wav(Buffer.from([9, 9]))), /exited \(4\)/);
  assert.equal(ane.isRunning(), false);
  assert.equal(await ane.transcribe(wav(Buffer.from([1, 2]))), "2 bytes");
  await ane.stop();
});

test("a helper that cannot start says why", async () => {
  const ane = new ParakeetAne("/models", {
    command: process.execPath,
    args: ["-e", 'console.error("no models here"); process.exit(3)', "--"],
  });
  await assert.rejects(ane.start(), /exited \(3\): no models here/);
});
