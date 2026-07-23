// Stable renderer-facing path for the pure conversation-graph helpers. The
// implementation is a native ES module so Vite behaves identically in
// development and production builds (mirrors conversationAide.js).
export * from "./conversationGraph.mjs";
import * as core from "./conversationGraph.mjs";

export default core;
