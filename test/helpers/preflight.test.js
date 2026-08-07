const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/preflight.ts");

// A machine that can record: a microphone, permission, the local engine, and a
// model on disk. Every case below is this with one thing taken away.
const READY = {
  audioInputs: 1,
  micPermission: "granted",
  useLocalWhisper: true,
  localProvider: "whisper",
  speechEngineReady: true,
  anyModelDownloaded: true,
  hasApiKey: null,
  questionCardsOn: true,
};

test("a machine that can record is not warned about anything", async () => {
  const { resolvePreflight, blocksRecording } = await load();
  assert.equal(resolvePreflight(READY), null);
  assert.equal(blocksRecording(null), false);
});

test("no microphone is the one problem that stops the press", async () => {
  const { resolvePreflight, blocksRecording } = await load();
  const problem = resolvePreflight({ ...READY, audioInputs: 0 });
  assert.equal(problem, "no-microphone");
  assert.equal(blocksRecording(problem), true);
  // And it outranks everything else: with no microphone the rest is irrelevant.
  assert.equal(
    resolvePreflight({
      ...READY,
      audioInputs: 0,
      speechEngineReady: false,
      anyModelDownloaded: false,
    }),
    "no-microphone"
  );
});

test("a refused microphone is distinguished from a missing one", async () => {
  const { resolvePreflight, blocksRecording } = await load();
  const problem = resolvePreflight({ ...READY, micPermission: "denied" });
  assert.equal(problem, "microphone-permission");
  // It warns but does not block: the user may grant it in the system dialog the
  // recording itself raises.
  assert.equal(blocksRecording(problem), false);
  // A prompt that has not been answered yet is not a refusal.
  assert.equal(resolvePreflight({ ...READY, micPermission: "prompt" }), null);
  assert.equal(resolvePreflight({ ...READY, micPermission: "unknown" }), null);
});

test("the cloud path is warned about its key and nothing else", async () => {
  const { resolvePreflight } = await load();
  const cloud = { ...READY, useLocalWhisper: false, speechEngineReady: false };
  assert.equal(resolvePreflight({ ...cloud, hasApiKey: false }), "no-api-key");
  assert.equal(resolvePreflight({ ...cloud, hasApiKey: true }), null);
  // A missing local engine is not the cloud path's problem.
  assert.equal(resolvePreflight({ ...cloud, hasApiKey: true, anyModelDownloaded: false }), null);
});

test("Parakeet is never told its Whisper model is missing", async () => {
  const { resolvePreflight } = await load();
  assert.equal(
    resolvePreflight({
      ...READY,
      localProvider: "nvidia",
      speechEngineReady: false,
      anyModelDownloaded: false,
    }),
    null,
    "the Whisper checks say nothing about a machine set to Parakeet"
  );
});

test("the engine is reported before the model it would have loaded", async () => {
  const { resolvePreflight } = await load();
  assert.equal(
    resolvePreflight({ ...READY, speechEngineReady: false, anyModelDownloaded: false }),
    "no-speech-engine"
  );
  assert.equal(resolvePreflight({ ...READY, anyModelDownloaded: false }), "no-model");
});

// The expensive direction of the two: a false alarm costs a real conversation,
// while a missed warning costs a summary that can be regenerated.
test("a check that could not run is never reported as a failure", async () => {
  const { resolvePreflight } = await load();
  assert.equal(
    resolvePreflight({ ...READY, speechEngineReady: null, anyModelDownloaded: null }),
    null
  );
  assert.equal(
    resolvePreflight({ ...READY, useLocalWhisper: false, hasApiKey: null }),
    null,
    "an unreadable key store must not block the cloud path"
  );
});

test("closed question-card gate warns without blocking — its failure mode is silence", async () => {
  const { resolvePreflight, blocksRecording } = await load();

  const problem = resolvePreflight({ ...READY, questionCardsOn: false });
  assert.equal(problem, "question-cards-off");
  assert.equal(blocksRecording(problem), false, "recording itself still works");

  // It also warns for API-key users — the aide is transcription-independent.
  assert.equal(
    resolvePreflight({
      ...READY,
      useLocalWhisper: false,
      hasApiKey: true,
      questionCardsOn: false,
    }),
    "question-cards-off"
  );

  // Unknown is not a problem, and any recording problem outranks it: the person
  // reads one line, and the line that saves the conversation wins.
  assert.equal(resolvePreflight({ ...READY, questionCardsOn: null }), null);
  assert.equal(
    resolvePreflight({ ...READY, audioInputs: 0, questionCardsOn: false }),
    "no-microphone"
  );
  assert.equal(
    resolvePreflight({ ...READY, anyModelDownloaded: false, questionCardsOn: false }),
    "no-model"
  );
});
