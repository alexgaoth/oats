// The settings a demo runs with, written to localStorage before the app reads
// them (the settings store reads localStorage once, as it loads).
//
//   onboarding done, English, the work interface
//   question cards on, read locally (no classifier model), auto-search off
//   a local summary model, so Finish writes a title and a summary
//
// Page parameters choose the rest: `theme=light|dark`, `view=calm|words`
// (the recording view), `flow=lanes|graph` (the flow card),
// `connections=lanes|graph` (the reading view's Connections tab).

const VIEWS = { calm: "clean", words: "detailed", clean: "clean", detailed: "detailed" };

export function applyDemoSettings(params) {
  const set = (key, value) => localStorage.setItem(key, value);
  set("onboardingCompleted", "true");
  set("uiLanguage", params.get("lang") || "en");
  set("uiMode", "work");
  set("theme", params.get("theme") === "dark" ? "dark" : "light");
  set("conversationDetail", VIEWS[params.get("view")] ?? "clean");
  set("conversationFlowView", params.get("flow") === "graph" ? "graph" : "lanes");
  set("connectionsView", params.get("connections") === "graph" ? "graph" : "lanes");
  set("conversationAideEnabled", "true");
  set("conversationAideInRoomEnabled", "true");
  set("conversationAideModel", "");
  set("conversationAutoSearchEnabled", "false");
  set("meetingUseLocalWhisper", "true");
  set("cleanupMode", "local");
  set("cleanupModel", "qwen3.5-4b-q4_k_m");
  set("autoGenerateNoteTitle", "true");
  // Where each topic graph's nodes were dragged to, per note id: a fresh page
  // lays them out afresh, so two runs draw the same graph.
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("oats:topic-layout:")) localStorage.removeItem(key);
  }
}
