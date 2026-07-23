// Stable renderer-facing path. The implementation is a native ES module so
// Vite behaves identically in development and production builds.
export * from "./conversationAide.mjs";
import * as core from "./conversationAide.mjs";

export default core;
