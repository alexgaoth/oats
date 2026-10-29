// The settings a demo runs with, written to localStorage before the app reads
// them (the settings store reads localStorage once, as it loads).
//
//   onboarding done, English, the work interface unless `field=1` (the field
//   backdrop, Settings › General › Advanced)
//   question cards on, read locally (no classifier model), auto-search off
//   unless `autosearch=1` (the fake main process records the search instead
//   of opening a browser: `window.oatsDemo.searches()`)
//   a local summary model on disk, so Finish writes a title and a summary,
//   unless `loop=1`: then the writing model is OpenAI's, and the live topic
//   check runs against the stand-in in fastModel.mjs (nothing leaves the page);
//   `writing=` stores a model the person chose, or `none`: none is ready
//   the context check off unless `check=1`, which turns it on with the demo's
//   team folder (context.mjs); `agent=1` adds its stand-in Claude Code
//
//   the writing model following the default (writingTier.mjs): on the fake
//   48 GB Mac Gemma 4 E4B, on disk unless `writingState=` says otherwise
//   (deviceTier.mjs); `processing=providers`, `keys=openai,anthropic`,
//   `writing=<model>` and `noticedWriting=1` change that
//
// Page parameters choose the rest: `firstrun=1` (the setup screen),
// `chosen=<model>` (a speech model the person chose), `speech=<language>` (the
// language Oats listens for, `auto` or `de` for example; English by default),
// `noticed=1` (the download's notice was shown before),
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
  set("uiMode", params.get("field") === "1" ? "field" : "work");
  set("theme", params.get("theme") === "dark" ? "dark" : "light");
  set("conversationDetail", VIEWS[params.get("view")] ?? "clean");
  set("conversationFlowView", params.get("flow") === "graph" ? "graph" : "lanes");
  set("connectionsView", params.get("connections") === "graph" ? "graph" : "lanes");
  set("conversationAideEnabled", "true");
  set("conversationAideInRoomEnabled", "true");
  set("conversationAideModel", "");
  set("conversationAutoSearchEnabled", params.get("autosearch") === "1" ? "true" : "false");
  // The speech model follows the default, as it does for somebody who never
  // chose one, unless `chosen=<model>` stores a choice (speechTier.mjs).
  if (params.get("chosen")) set("whisperModel", params.get("chosen"));
  else localStorage.removeItem("whisperModel");
  // The one-time notice of turbo's download shows again on each page, unless
  // `noticed=1` says it was shown before.
  if (params.get("noticed") === "1") set("speechUpgradeNoticed", "1");
  else localStorage.removeItem("speechUpgradeNoticed");
  // The speech language: English unless `speech=` names another. With "auto",
  // the speech model stays small (speechTier.mjs). With any language but
  // English (`speech=de`), the board links conversations by words, as it did
  // before it read meaning.
  if (params.get("speech")) {
    set("preferredLanguage", params.get("speech"));
    set("speechLanguageDefaultMigrated", "1");
  } else {
    localStorage.removeItem("preferredLanguage");
  }
  // The writing model follows the default unless `loop=1` stores OpenAI's
  // fast model, or `writing=<model>` stores one the person chose
  // (writingTier.mjs); `processing=providers` is "With an API key" for both
  // models, whose keys come from `keys=` (boot.mjs).
  for (const key of ["cleanupModel", "cleanupProvider", "oats.processing.models"]) {
    localStorage.removeItem(key);
  }
  set("writingModelDefaultMigrated", "1");
  // A profile that has run before: the one-time provider migration would
  // derive the transcription modes from the speech switch again
  // (settingsStore.ts), and "With an API key" without an OpenAI key keeps the
  // switch on this Mac by design.
  set("_providerSettingsMigrated", "1");
  if (params.get("noticedWriting") === "1") set("writingModelNoticed", "1");
  else localStorage.removeItem("writingModelNoticed");
  const providers = params.get("loop") === "1" || params.get("processing") === "providers";
  const mode = providers ? "providers" : "local";
  for (const key of [
    "cleanupMode",
    "noteFormattingMode",
    "transcriptionMode",
    "meetingTranscriptionMode",
  ]) {
    set(key, mode);
  }
  // With API keys, speech goes to OpenAI only with its key (settingsStore.ts).
  const openaiKey = params.get("loop") === "1" || (params.get("keys") ?? "").includes("openai");
  set("meetingUseLocalWhisper", providers && openaiKey ? "false" : "true");
  set("useLocalWhisper", providers && openaiKey ? "false" : "true");
  if (params.get("loop") === "1") {
    set("cleanupProvider", "openai");
    set("cleanupModel", "gpt-5.6-luna");
  } else if (params.get("writing") && params.get("writing") !== "none") {
    // `writing=<model>` stores a model the person chose (with `download=`, one
    // still downloading: boot.mjs). `writing=none` follows the default with
    // nothing on disk and its download declined, so none is ready
    // (deviceTier.mjs, boot.mjs).
    set("cleanupProvider", providers ? "openai" : "local");
    set("cleanupModel", params.get("writing"));
  }
  // The conversations owed a summary start empty on each page
  // (stores/summaryQueueStore.ts), unless `owed=keep` keeps the last page's.
  if (params.get("owed") !== "keep") localStorage.removeItem("oatsPendingSummaries");
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
