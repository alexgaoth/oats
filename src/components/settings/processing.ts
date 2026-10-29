import {
  applyProvidersSpeech,
  chooseWritingModel,
  forgetWritingChoice,
  selectProcessingMode,
  useSettingsStore,
} from "../../stores/settingsStore";
import {
  isStoredDefault,
  WRITING_MODEL_KEY,
  WRITING_PROVIDER_KEY,
} from "../../helpers/writingTier.mjs";

/**
 * The one Processing switch: every feature on this Mac, or every feature on
 * the providers. Kept apart from the components so it can be pinned by tests
 * and reused by setup.
 *
 * Neither side stores a model by itself. A writing model nobody chose follows
 * the default (writingTier.mjs, settingsStore.ts): on this Mac the model its
 * memory holds, Gemma 4 E4B with 16 GB or more and Qwen3.5 4B under that; with
 * API keys gpt-6.1-sol with an OpenAI key, OpenAI's most accurate summaries
 * for the price (docs/summaries.md, #143), or Claude Opus 5.5 with only an
 * Anthropic key (#145). A model somebody chose is kept, and comes back when
 * the switch comes back to its side.
 */

export type ProcessingMode = "local" | "providers";

/** "local" or "providers" when every feature agrees, "mixed" when they differ. */
export function processingMode(state: ReturnType<typeof useSettingsStore.getState>) {
  return selectProcessingMode(state);
}

// The writing model each side last had chosen, so switching away and back
// restores a choice. A side with no entry follows the default. Without it a
// cloud model id outlived the switch to local and summaries kept going to the
// provider.
const MODEL_MEMORY_KEY = "oats.processing.models";
// Version 2 holds choices only. Earlier versions also remembered the defaults
// they stored by themselves; those are read once as no choice.
const MEMORY_VERSION = 2;
interface RememberedModels {
  cleanupModel: string;
  cleanupProvider: string;
}
type Memory = Partial<Record<ProcessingMode, RememberedModels | null>>;

function readMemory(): Memory {
  try {
    const stored = JSON.parse(localStorage.getItem(MODEL_MEMORY_KEY) || "{}") ?? {};
    const memory: Memory = { local: stored.local ?? null, providers: stored.providers ?? null };
    for (const mode of ["local", "providers"] as const) {
      const entry = memory[mode];
      if (!entry?.cleanupModel?.trim()) {
        memory[mode] = null;
      } else if (
        stored.version !== MEMORY_VERSION &&
        isStoredDefault({
          mode,
          provider: entry.cleanupProvider ?? null,
          model: entry.cleanupModel,
        })
      ) {
        memory[mode] = null;
      }
    }
    return memory;
  } catch {
    return {};
  }
}
function writeMemory(memory: Memory) {
  try {
    localStorage.setItem(MODEL_MEMORY_KEY, JSON.stringify({ version: MEMORY_VERSION, ...memory }));
  } catch {
    // A preference that cannot be stored is only forgotten, never wrong.
  }
}

/** The writing model the person chose, as stored; null when it follows the default. */
function storedWritingChoice(): RememberedModels | null {
  try {
    const model = localStorage.getItem(WRITING_MODEL_KEY);
    if (model === null || !model.trim()) return null;
    return {
      cleanupModel: model,
      cleanupProvider: localStorage.getItem(WRITING_PROVIDER_KEY) ?? "",
    };
  } catch {
    return null;
  }
}

/** Point every feature at this Mac or at the providers, in one choice. */
export function setProcessing(mode: ProcessingMode) {
  const store = useSettingsStore.getState();
  const current = processingMode(store);
  const memory = readMemory();
  if (current !== "mixed") {
    memory[current] = storedWritingChoice();
    writeMemory(memory);
  }

  // Speech. On this Mac, every scope local. With API keys, OpenAI when its key
  // is stored and this Mac without it (applyProvidersSpeech).
  if (mode === "local") {
    store.setCloudTranscriptionForAllScopes({
      useLocalWhisper: true,
      cloudTranscriptionMode: "byok",
    });
    store.setTranscriptionMode(mode);
    store.setMeetingTranscriptionMode(mode);
  } else {
    applyProvidersSpeech();
  }

  // Writing: summaries take the cleanup scope's whole configuration.
  store.setCleanupMode(mode);
  store.setNoteFormattingMode(mode);
  const remembered = memory[mode];
  if (remembered) chooseWritingModel(remembered.cleanupProvider, remembered.cleanupModel);
  else forgetWritingChoice();
}
