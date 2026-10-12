const test = require("node:test");
const assert = require("node:assert/strict");

// What the sidebar's footer says (onDeviceSummary.mjs). "On this Mac" is a
// claim, so it is made only when every part that can run does run here; any
// other part is named for where it goes.

let describeOnDevice;
let destinationOf;
let hostOf;
test.before(async () => {
  ({ describeOnDevice, destinationOf, hostOf } =
    await import("../../src/helpers/onDeviceSummary.mjs"));
});

const HERE = { local: true };
const WHISPER = { local: true, engine: "whisper" };
const SERVER = { model: "base.en", backend: "Metal" };

function describe(overrides = {}) {
  return describeOnDevice({
    platform: "darwin",
    conversation: WHISPER,
    dictation: null,
    writing: HERE,
    server: SERVER,
    requests: 0,
    ...overrides,
  });
}

test("everything local says so, names the model and its backend, and counts", () => {
  assert.deepEqual(describe(), {
    place: { kind: "here", device: "mac" },
    model: { name: "base.en", backend: "Metal" },
    requests: 0,
  });
  assert.deepEqual(describe({ platform: "linux" }).place, { kind: "here", device: "computer" });
  assert.deepEqual(describe({ platform: "win32" }).place, { kind: "here", device: "computer" });
});

test("one provider for speech and writing is named once", () => {
  const summary = describe({
    conversation: { local: false, name: "OpenAI" },
    writing: { local: false, name: "OpenAI" },
    requests: 14,
  });
  assert.deepEqual(summary.place, { kind: "both", names: ["OpenAI"] });
  // No local speech, so no model line: nothing here loaded one for this.
  assert.equal(summary.model, null);
  assert.equal(summary.requests, 14);
});

test("different places are each named, and a local part is not", () => {
  assert.deepEqual(
    describe({
      conversation: { local: false, name: "OpenAI" },
      writing: { local: false, name: "Anthropic" },
    }).place,
    { kind: "split", speech: ["OpenAI"], writing: ["Anthropic"] }
  );
  const writingAway = describe({ writing: { local: false, name: "Groq" } });
  assert.deepEqual(writingAway.place, { kind: "split", speech: [], writing: ["Groq"] });
  // The speech still runs here, so its model line stays.
  assert.deepEqual(writingAway.model, { name: "base.en", backend: "Metal" });
});

test("dictation counts only while it is on", () => {
  const groq = { local: false, name: "Groq" };
  assert.deepEqual(describe({ dictation: groq }).place, {
    kind: "split",
    speech: ["Groq"],
    writing: [],
  });
  assert.deepEqual(describe({ dictation: null }).place, { kind: "here", device: "mac" });
  assert.deepEqual(
    describe({
      conversation: { local: false, name: "OpenAI" },
      dictation: groq,
      writing: { local: false, name: "OpenAI" },
    }).place,
    { kind: "split", speech: ["OpenAI", "Groq"], writing: ["OpenAI"] }
  );
});

test("a server the footer cannot name is still not called local", () => {
  assert.deepEqual(describe({ writing: { local: false, name: null } }).place, {
    kind: "split",
    speech: [],
    writing: [null],
  });
});

test("the model line is the running whisper-server's own report, or nothing", () => {
  assert.equal(describe({ server: null }).model, null, "no server up: no line");
  assert.deepEqual(describe({ server: { model: "base.en", backend: null } }).model, {
    name: "base.en",
    backend: null,
  });
  // Parakeet does not report a backend, so it gets no line rather than a guess.
  assert.equal(describe({ conversation: { local: true, engine: "nvidia" } }).model, null);
  assert.equal(describe({ conversation: { local: false, name: "OpenAI" } }).model, null);
});

test("the count is shown only once the main process has sent one", () => {
  assert.equal(describe({ requests: undefined }).requests, null);
  assert.equal(describe({ requests: null }).requests, null);
  assert.equal(describe({ requests: -1 }).requests, null);
  assert.equal(describe({ requests: 2.5 }).requests, null);
  assert.equal(describe({ requests: 3 }).requests, 3);
});

test("where a part runs follows its mode, provider and URL", () => {
  assert.deepEqual(destinationOf({ mode: "local", provider: "openai" }), { local: true });
  assert.deepEqual(
    destinationOf({ mode: "providers", provider: "openai", providerName: "OpenAI" }),
    {
      local: false,
      name: "OpenAI",
    }
  );
  assert.deepEqual(destinationOf({ mode: "providers", provider: "anthropic" }), {
    local: false,
    name: "anthropic",
  });
  // A custom endpoint is named by its host, and one on this machine is local.
  assert.deepEqual(
    destinationOf({ mode: "providers", provider: "custom", baseUrl: "https://llm.example.org/v1" }),
    { local: false, name: "llm.example.org" }
  );
  assert.deepEqual(
    destinationOf({ mode: "providers", provider: "custom", baseUrl: "http://localhost:11434/v1" }),
    { local: true }
  );
  assert.deepEqual(destinationOf({ mode: "self-hosted", remoteUrl: "http://192.168.1.20:8080" }), {
    local: false,
    name: "192.168.1.20",
  });
  assert.deepEqual(destinationOf({ mode: "self-hosted", remoteUrl: "http://127.0.0.1:8080" }), {
    local: true,
  });
  assert.deepEqual(destinationOf({ mode: "self-hosted", remoteUrl: "" }), {
    local: false,
    name: null,
  });
});

test("a host is read without its port, and nothing is read from a non-URL", () => {
  assert.equal(hostOf("http://192.168.1.20:8080/v1"), "192.168.1.20");
  assert.equal(hostOf(" https://api.openai.com/v1 "), "api.openai.com");
  assert.equal(hostOf("not a url"), null);
  assert.equal(hostOf(undefined), null);
});
