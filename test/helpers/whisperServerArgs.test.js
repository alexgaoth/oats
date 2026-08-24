const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWhisperServerArgs } = require("../../src/helpers/whisperServer.js");

const base = { modelPath: "/m.bin", port: 8899, threads: 4 };
const argsFor = (extra = {}) => buildWhisperServerArgs({ ...base, ...extra });

// An accuracy fix, not a formatting one: whisper.cpp v1.9.x enables a
// 60-character segment wrap that breaks words in half when split_on_word is off.
test("timestamps are always off, because we only read text", () => {
  assert.ok(argsFor().includes("--no-timestamps"));
  assert.ok(argsFor({ language: "de", gpuDeviceIndex: 1 }).includes("--no-timestamps"));
});

test("no language means auto-detection, explicitly", () => {
  const args = argsFor();
  assert.equal(args[args.indexOf("--language") + 1], "auto");
  assert.equal(
    argsFor({ language: "en" })[argsFor({ language: "en" }).indexOf("--language") + 1],
    "en"
  );
});

// `--device` counts ggml's logical devices. Emitting it with a non-index would
// select the wrong GPU or fail to start, so only a real index gets through.
test("a GPU index is passed when it is one, and omitted when it is not", () => {
  const withGpu = argsFor({ gpuDeviceIndex: 2 });
  assert.equal(withGpu[withGpu.indexOf("--device") + 1], "2");
  // Emitting `--device` with a non-index would select the wrong GPU or fail to
  // start, so anything that is not a real index must not reach the command line.
  for (const bad of [null, undefined, -1, 1.5, "1", NaN]) {
    assert.ok(!argsFor({ gpuDeviceIndex: bad }).includes("--device"), String(bad));
  }
});

test("device 0 is a real device, not a falsy one", () => {
  assert.ok(argsFor({ gpuDeviceIndex: 0 }).includes("--device"));
});

test("threads are optional and never emitted empty", () => {
  assert.ok(!buildWhisperServerArgs({ modelPath: "/m.bin", port: 1 }).includes("--threads"));
});
