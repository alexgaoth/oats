const test = require("node:test");
const assert = require("node:assert/strict");

// How the writing model's server is started: what the environment turns off.

test("llama-server keeps no past prompts in memory beside the model", () => {
  const LlamaServerManager = require("../../src/helpers/llamaServer");
  const saved = process.env.LLAMA_ARG_CACHE_RAM;
  delete process.env.LLAMA_ARG_CACHE_RAM;
  try {
    const env = new LlamaServerManager()._buildEnv("/opt/oats/bin/llama-server");
    assert.equal(env.LLAMA_ARG_CACHE_RAM, "0");
  } finally {
    if (saved !== undefined) process.env.LLAMA_ARG_CACHE_RAM = saved;
  }
});
