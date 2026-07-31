// Stable renderer-facing path for the pure suggestion helpers. The implementation
// is a native ES module so Vite behaves identically in development and production
// builds (mirrors conversationAide.js).
export * from "./conversationSuggestions.mjs";
import * as core from "./conversationSuggestions.mjs";

export default core;
