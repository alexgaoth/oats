import { useSettingsStore } from "../../stores/settingsStore";

/**
 * The one Processing switch: every feature on this Mac, or every feature on
 * the providers. Kept apart from the components so it can be pinned by tests
 * and reused by onboarding.
 */

export const DEFAULT_LOCAL_MODEL = "qwen3.5-4b-q4_k_m";
export const DEFAULT_CLOUD_MODEL = "gpt-5.6-terra";

export type ProcessingMode = "local" | "providers";

/** "local" or "providers" when every feature agrees, "mixed" when they differ. */
export function processingMode(state: ReturnType<typeof useSettingsStore.getState>) {
  // Summaries follow the cleanup scope (`selectResolvedLLMConfig`), so their
  // own mode no longer decides anything and is left out.
  const modes = [state.transcriptionMode, state.cleanupMode, state.meetingTranscriptionMode];
  if (modes.every((mode) => mode === "local")) return "local";
  if (modes.every((mode) => mode === "providers")) return "providers";
  return "mixed";
}

// The summary and cleanup models each mode last used, so switching away and back
// restores them. Without it a cloud model id outlived the switch to local and
// summaries kept going to the provider.
const MODEL_MEMORY_KEY = "oats.processing.models";
interface RememberedModels {
  cleanupModel: string;
  noteFormattingModel: string;
  cleanupProvider: string;
  noteFormattingProvider: string;
}
function readMemory(): Partial<Record<ProcessingMode, RememberedModels>> {
  try {
    return JSON.parse(localStorage.getItem(MODEL_MEMORY_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}
function writeMemory(memory: Partial<Record<ProcessingMode, RememberedModels>>) {
  try {
    localStorage.setItem(MODEL_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // A preference that cannot be stored is only forgotten, never wrong.
  }
}

/** Point every feature at this Mac or at the providers, in one choice. */
export function setProcessing(mode: ProcessingMode) {
  const store = useSettingsStore.getState();
  const current = processingMode(store);
  const memory = readMemory();
  if (current !== "mixed") {
    memory[current] = {
      cleanupModel: store.cleanupModel,
      noteFormattingModel: store.noteFormattingModel,
      cleanupProvider: store.cleanupProvider,
      noteFormattingProvider: store.noteFormattingProvider,
    };
    writeMemory(memory);
  }

  store.setTranscriptionMode(mode);
  store.setCleanupMode(mode);
  store.setNoteFormattingMode(mode);
  store.setMeetingTranscriptionMode(mode);
  store.setMeetingUseLocalWhisper(mode === "local");
  store.setCloudTranscriptionForAllScopes({
    useLocalWhisper: mode === "local",
    cloudTranscriptionMode: "byok",
  });

  const remembered = memory[mode];
  if (mode === "local") {
    store.setCleanupProvider("local");
    store.setNoteFormattingProvider("local");
    store.setCleanupModel(remembered?.cleanupModel || DEFAULT_LOCAL_MODEL);
    store.setNoteFormattingModel(remembered?.noteFormattingModel || DEFAULT_LOCAL_MODEL);
  } else {
    store.setCleanupProvider(remembered?.cleanupProvider || "openai");
    store.setNoteFormattingProvider(remembered?.noteFormattingProvider || "openai");
    store.setCleanupModel(remembered?.cleanupModel || DEFAULT_CLOUD_MODEL);
    store.setNoteFormattingModel(remembered?.noteFormattingModel || DEFAULT_CLOUD_MODEL);
  }
}
