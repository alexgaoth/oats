// The settings a demo runs with, written to localStorage before the app reads
// them (the settings store reads localStorage once, as it loads).
//
//   onboarding done, English, the work interface
//   question cards on, read locally (no classifier model), auto-search off
//   unless `autosearch=1` (the fake main process records the search instead
//   of opening a browser: `window.oatsDemo.searches()`)
//   a local summary model, so Finish writes a title and a summary, unless
//   `loop=1`: then the writing model is OpenAI's, and the live topic check
//   runs against the stand-in in fastModel.mjs (nothing leaves the page)
//   the context check off unless `check=1`, which turns it on with the demo's
//   team folder (context.mjs); `agent=1` adds its stand-in Claude Code
//
// Page parameters choose the rest: `firstrun=1` (the setup screen),
// `theme=light|dark`, `view=calm|words`
// (the recording view), `flow=lanes|graph` (the flow card),
// `connections=lanes|graph` (the reading view's Connections tab).

import { CONTEXT_FOLDER } from "./context.mjs";

const VIEWS = { calm: "clean", words: "detailed", clean: "clean", detailed: "detailed" };

export function applyDemoSettings(params) {
  const set = (key, value) => localStorage.setItem(key, value);
  // `firstrun=1`: a profile that has never finished setup, so the app opens on
  // the setup screen, as it does for somebody who just downloaded it.
  if (params.get("firstrun") === "1") {
    for (const key of ["onboardingCompleted", "onboardingCurrentStep", "micPermissionGranted"]) {
      localStorage.removeItem(key);
    }
  } else {
    set("onboardingCompleted", "true");
  }
  set("uiLanguage", params.get("lang") || "en");
  set("uiMode", "work");
  set("theme", params.get("theme") === "dark" ? "dark" : "light");
  set("conversationDetail", VIEWS[params.get("view")] ?? "clean");
  set("conversationFlowView", params.get("flow") === "graph" ? "graph" : "lanes");
  set("connectionsView", params.get("connections") === "graph" ? "graph" : "lanes");
  set("conversationAideEnabled", "true");
  set("conversationAideInRoomEnabled", "true");
  set("conversationAideModel", "");
  set("conversationAutoSearchEnabled", params.get("autosearch") === "1" ? "true" : "false");
  set("meetingUseLocalWhisper", "true");
  if (params.get("loop") === "1") {
    set("cleanupMode", "providers");
    set("cleanupProvider", "openai");
    set("cleanupModel", "gpt-5.6-luna");
  } else {
    set("cleanupMode", "local");
    set("cleanupModel", "qwen3.5-4b-q4_k_m");
  }
  set("autoGenerateNoteTitle", "true");
  set("contextCheckEnabled", params.get("check") === "1" ? "true" : "false");
  set("contextFolder", params.get("check") === "1" ? CONTEXT_FOLDER : "");
  set("contextAgentEnabled", params.get("agent") === "1" ? "true" : "false");
  // Where each topic graph's nodes were dragged to, per note id: a fresh page
  // lays them out afresh, so two runs draw the same graph.
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("oats:topic-layout:")) localStorage.removeItem(key);
  }
}
