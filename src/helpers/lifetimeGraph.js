// Stable renderer-facing path for the pure lifetime-graph helpers. The
// implementation is a native ES module so Vite behaves identically in
// development and production builds (mirrors conversationAide.js).
export * from "./lifetimeGraph.mjs";
import * as core from "./lifetimeGraph.mjs";

export default core;
