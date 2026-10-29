const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const registry = require("../../src/models/modelRegistryData.json");
const OpenAIRealtimeStreaming = require("../../src/helpers/openaiRealtimeStreaming");

// gpt-transcribe heard 5 points more of the words than gpt-4o-mini-transcribe
// in a quiet room and 10 more with steady sound, at the same speed
// (docs/dictation-accuracy.md, "Remote models"). It is the OpenAI default.
const DEFAULT = "gpt-transcribe";

test("the OpenAI transcription default is the first model of the registry", () => {
  const openai = registry.transcriptionProviders.find((p) => p.id === "openai");
  assert.equal(openai.models[0].id, DEFAULT);
  // Streaming: the realtime path takes it for dictation and conversations.
  assert.equal(openai.models[0].streaming, true);
});

test("every locale describes the default model", () => {
  const openai = registry.transcriptionProviders.find((p) => p.id === "openai");
  const key = openai.models[0].descriptionKey.split(".");
  const locales = path.join(__dirname, "../../src/locales");
  for (const locale of fs.readdirSync(locales)) {
    const file = path.join(locales, locale, "translation.json");
    if (!fs.existsSync(file)) continue;
    const text = key.reduce(
      (node, part) => node?.[part],
      JSON.parse(fs.readFileSync(file, "utf8"))
    );
    assert.equal(typeof text, "string", `${locale} has no ${key.join(".")}`);
  }
});

test("a realtime session without a model asks for the default", () => {
  assert.equal(new OpenAIRealtimeStreaming().model, DEFAULT);
});
