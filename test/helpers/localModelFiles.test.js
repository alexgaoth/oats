const test = require("node:test");
const assert = require("node:assert/strict");

const registry = require("../../src/models/modelRegistryData.json");

const localModel = (id) =>
  registry.localProviders.flatMap((provider) => provider.models).find((model) => model.id === id);

// Hugging Face file names are case-sensitive. On 2026-07-16 ggml-org replaced
// `gpt-oss-20b-mxfp4.gguf` with `gpt-oss-20b-MXFP4.gguf`, and the old name
// answers HTTP 404: the download in Settings failed for everybody.
test("GPT-OSS 20B downloads the file Hugging Face serves", () => {
  const model = localModel("gpt-oss-20b-mxfp4");
  assert.equal(model.hfRepo, "ggml-org/gpt-oss-20b-GGUF");
  assert.equal(model.fileName, "gpt-oss-20b-MXFP4.gguf");
  // The size Hugging Face lists for that file (the disk-space check uses it).
  assert.equal(model.sizeBytes, 12_109_566_624);
});
