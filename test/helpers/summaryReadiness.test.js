const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/summaryReadiness.ts");

const LOCAL = { mode: "local", model: "qwen3.5-4b-q4_k_m", remoteUrl: "", localModelDownloaded: true };

test("a downloaded local model is ready", async () => {
  const { summaryReadiness } = await load();
  assert.equal(summaryReadiness(LOCAL), "ready");
});

test("a fresh install has no model, and says so", async () => {
  const { summaryReadiness } = await load();
  assert.equal(summaryReadiness({ ...LOCAL, model: "" }), "no-model");
  assert.equal(summaryReadiness({ ...LOCAL, model: "   " }), "no-model");
});

test("a local model that was chosen but never downloaded is not ready", async () => {
  const { summaryReadiness } = await load();
  // What "On this computer" leaves behind: a model id, and no file.
  assert.equal(summaryReadiness({ ...LOCAL, localModelDownloaded: false }), "model-missing");
});

test("a local model that could not be checked is unknown, not missing", async () => {
  const { summaryReadiness } = await load();
  assert.equal(summaryReadiness({ ...LOCAL, localModelDownloaded: null }), null);
});

test("a provider needs a model, not a download", async () => {
  const { summaryReadiness } = await load();
  assert.equal(
    summaryReadiness({ mode: "providers", model: "gpt-5-mini", remoteUrl: "", localModelDownloaded: null }),
    "ready"
  );
  assert.equal(
    summaryReadiness({ mode: "providers", model: "", remoteUrl: "", localModelDownloaded: null }),
    "no-model"
  );
});

test("a self-hosted endpoint needs its address", async () => {
  const { summaryReadiness } = await load();
  assert.equal(
    summaryReadiness({ mode: "self-hosted", model: "", remoteUrl: "http://10.0.0.2:8080", localModelDownloaded: null }),
    "ready"
  );
  assert.equal(
    summaryReadiness({ mode: "self-hosted", model: "x", remoteUrl: " ", localModelDownloaded: null }),
    "no-endpoint"
  );
});

test("a provider without its key is not ready; one that needs none, or could not be told, is", async () => {
  const { summaryReadiness } = await load();
  const providers = { mode: "providers", model: "gpt-6.1-sol", remoteUrl: "", localModelDownloaded: null };
  assert.equal(summaryReadiness({ ...providers, providerKey: false }), "no-key");
  assert.equal(summaryReadiness({ ...providers, providerKey: true }), "ready");
  assert.equal(summaryReadiness({ ...providers, providerKey: null }), "ready");
  assert.equal(summaryReadiness(providers), "ready");
  // A key says nothing of a model on this Mac.
  assert.equal(summaryReadiness({ ...LOCAL, providerKey: false }), "ready");
});
