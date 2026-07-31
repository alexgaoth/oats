// Stable renderer-facing path for the pure topic-tracking helpers. The
// implementation is a native ES module so Vite behaves identically in
// development and production builds (mirrors conversationAide.js).
export * from "./conversationTopics.mjs";
import * as core from "./conversationTopics.mjs";

export default core;
