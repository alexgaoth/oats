const modelRegistryData = require("../models/modelRegistryData.json");

const REQUIRED_MODEL_FILES = [
  "encoder.int8.onnx",
  "decoder.int8.onnx",
  "joiner.int8.onnx",
  "tokens.txt",
];

/** Written after the last file, so a stopped download never counts as a model. */
const ANE_READY_FILE = "ready";

function getModelRuntime(modelName) {
  const runtime = modelRegistryData.parakeetModels?.[modelName]?.runtime;
  return runtime === "online" || runtime === "ane" ? runtime : "offline";
}

function requiredModelFiles(modelName) {
  return getModelRuntime(modelName) === "ane" ? [ANE_READY_FILE] : REQUIRED_MODEL_FILES;
}

module.exports = { ANE_READY_FILE, REQUIRED_MODEL_FILES, getModelRuntime, requiredModelFiles };
