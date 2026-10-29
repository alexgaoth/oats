// Which writing model Oats uses when nobody chose one: on this Mac, the most
// accurate local model its memory holds; with API keys, the provider's most
// accurate model for summaries.
//
// The local choice comes from the summary eval (docs/summaries.md, 24 AMI
// meetings, the prompt as shipped). Accuracy comes first, and the model that
// invents the fewest facts is Gemma 4 E4B: 1.7 invented facts a summary,
// against 5.0 to 5.7 for the Qwen models. It needs about 6.8 GB at its peak,
// so it is the choice on a Mac with 16 GB of memory or more. Under 16 GB, Qwen3.5
// 4B (5.6 GB at its peak) is the choice; Gemma would take most of the memory.
//
//   model         file     covered   invented facts   memory at its peak
//   Gemma 4 E4B   5.4 GB   54%       1.7              6.8 GB
//   Qwen3.5 4B    2.7 GB   59%       5.7              5.6 GB
//
// With API keys (the same eval): gpt-6.1-sol is OpenAI's most accurate for
// summaries at its price, and Claude Opus 5.5 Anthropic's. OpenAI comes first
// when both keys are there, because its key also transcribes a conversation
// (gpt-transcribe); Anthropic's comes first when it is the only key.
//
// The choice is only a default. A writing model somebody chose is never
// changed: the settings store follows this rule only while no model is stored
// (settingsStore.ts), the same rule the speech model keeps (speechTier.mjs).
// On this Mac, the default model is downloaded after setup when no writing
// model is ready, visibly and cancellably (writingModelFetch.js).
//
// Pure and DOM-free: the main process and the renderer share it, and
// test/helpers/writingTier.test.js pins every branch.

/** Gemma 4 E4B, Q4_K_M (modelRegistryData.json): the choice with 16 GB or more. */
export const LARGE_WRITING_MODEL = "gemma-4-e4b-it-q4_k_m";

/** Qwen3.5 4B, Q4_K_M: the choice under 16 GB. */
export const SMALL_WRITING_MODEL = "qwen3.5-4b-q4_k_m";

/** The two local models the rule can choose, largest first. */
export const LOCAL_WRITING_MODELS = Object.freeze([LARGE_WRITING_MODEL, SMALL_WRITING_MODEL]);

/** Less memory than this gets the small model. */
export const MIN_LARGE_WRITING_MEMORY_BYTES = 16 * 1024 ** 3;

/** Each provider's most accurate writing model for summaries (docs/summaries.md). */
export const CLOUD_WRITING_MODELS = Object.freeze({
  openai: "gpt-6.1-sol",
  anthropic: "claude-opus-5-5",
});

const positive = (value) => (typeof value === "number" && value > 0 ? value : null);

/**
 * The local writing model this Mac's memory holds.
 *
 * - "fits": 16 GB or more, Gemma 4 E4B.
 * - "memory": under 16 GB, Qwen3.5 4B.
 * - "unknown": memory not read yet; the small model, and nothing is fetched
 *   for it (`shouldFetchWritingModel`).
 *
 * @param {{ memoryBytes?: number | null }} input
 * @returns {{ model: string, reason: "fits" | "memory" | "unknown" }}
 */
export function chooseLocalWritingModel({ memoryBytes = null } = {}) {
  const memory = positive(memoryBytes);
  if (memory === null) return { model: SMALL_WRITING_MODEL, reason: "unknown" };
  if (memory >= MIN_LARGE_WRITING_MEMORY_BYTES) {
    return { model: LARGE_WRITING_MODEL, reason: "fits" };
  }
  return { model: SMALL_WRITING_MODEL, reason: "memory" };
}

/**
 * The local writing model a setting that follows the default uses now: the
 * one chosen for this Mac once it is on disk, and until then the small model
 * when that one is on disk already (a profile from before this rule), so a
 * writing model that is ready keeps working while the larger one is fetched.
 * The small model never stands in for the large one the other way round: on a
 * Mac under 16 GB the large one is too much for its memory.
 *
 * @param {{ memoryBytes?: number | null, installed?: readonly string[] }} input
 * @returns {{ model: string, reason: "fits" | "memory" | "unknown" | "installed" }}
 */
export function defaultLocalWritingModel({ memoryBytes = null, installed = [] } = {}) {
  const choice = chooseLocalWritingModel({ memoryBytes });
  const onDisk = new Set(installed ?? []);
  if (
    choice.model === LARGE_WRITING_MODEL &&
    !onDisk.has(LARGE_WRITING_MODEL) &&
    onDisk.has(SMALL_WRITING_MODEL)
  ) {
    return { model: SMALL_WRITING_MODEL, reason: "installed" };
  }
  return choice;
}

/**
 * The writing model a setting nobody changed resolves to in a processing
 * mode, or null where nothing is defaulted (a server of the person's own).
 *
 * @param {object} input
 * @param {string} input.mode The writing scope's mode: "local", "providers" or "self-hosted".
 * @param {number | null} [input.memoryBytes]
 * @param {readonly string[]} [input.installed] Local writing models on disk.
 * @param {boolean} [input.openaiKey] An OpenAI key is stored.
 * @param {boolean} [input.anthropicKey] An Anthropic key is stored.
 * @returns {{ provider: string, model: string,
 *   reason: "fits" | "memory" | "unknown" | "installed" | "openai" | "anthropic" | "no-key" } | null}
 */
export function defaultWritingModel({
  mode,
  memoryBytes = null,
  installed = [],
  openaiKey = false,
  anthropicKey = false,
} = {}) {
  if (mode === "local") {
    return { provider: "local", ...defaultLocalWritingModel({ memoryBytes, installed }) };
  }
  if (mode === "providers") {
    if (openaiKey)
      return { provider: "openai", model: CLOUD_WRITING_MODELS.openai, reason: "openai" };
    if (anthropicKey) {
      return { provider: "anthropic", model: CLOUD_WRITING_MODELS.anthropic, reason: "anthropic" };
    }
    return { provider: "openai", model: CLOUD_WRITING_MODELS.openai, reason: "no-key" };
  }
  return null;
}

/** Where the renderer keeps a writing model the person chose (localStorage). */
export const WRITING_MODEL_KEY = "cleanupModel";
export const WRITING_PROVIDER_KEY = "cleanupProvider";

/**
 * Whether the writing setting follows the default: no model is stored. A
 * stored model is a choice, and a choice is never moved by this rule. An empty
 * one is not a choice: the old model screen stored "" over a model it found
 * missing on disk, just for being opened.
 *
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @returns {boolean}
 */
export function followsDefaultWritingModel(storage) {
  if (!storage) return true;
  const stored = storage.getItem(WRITING_MODEL_KEY);
  return stored === null || stored.trim() === "";
}

/** Set once the stored defaults of earlier versions were forgotten (localStorage). */
export const WRITING_MIGRATION_KEY = "writingModelDefaultMigrated";

/**
 * The cloud models the processing switch stored by itself under OpenAI, by
 * version: gpt-5.6-terra from its start (2026-07-30) through 0.1.0, and
 * gpt-6.1-sol after #144 (2026-10-28). Nothing else ever stored a cloud model
 * without the person picking a provider.
 */
const STORED_CLOUD_DEFAULTS = Object.freeze(["gpt-5.6-terra", CLOUD_WRITING_MODELS.openai]);

/**
 * Whether a stored writing model is one an earlier version stored by itself:
 * the switch to "On this Mac" stored Qwen3.5 4B under the provider "local",
 * and the switch to the providers stored gpt-5.6-terra, later gpt-6.1-sol,
 * under OpenAI (processing.ts before 0.2; OatsWorkspace.tsx before that). The
 * model pickers store a local model under its family ("qwen"), never "local",
 * so the pair tells the two apart. Forgetting one loses nothing a person chose:
 * the default resolves to OpenAI's model wherever an OpenAI key is stored, to
 * Anthropic's where only that key is, and Qwen3.5 4B stays in use while it is
 * the one on disk (`defaultLocalWritingModel`).
 *
 * @param {{ mode?: string | null, provider?: string | null, model?: string | null }} stored
 * @returns {boolean}
 */
export function isStoredDefault({ mode = null, provider = null, model = null } = {}) {
  if (mode === "local") {
    return model === SMALL_WRITING_MODEL && (provider === null || provider === "local");
  }
  if (mode === "providers") {
    return provider === "openai" && STORED_CLOUD_DEFAULTS.includes(model);
  }
  return false;
}

/**
 * Once: forget a writing model an earlier version stored by itself, or the
 * empty one the old model screen stored, so the setting follows the default
 * (`isStoredDefault`). True when one was forgotten.
 *
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined} storage
 * @returns {boolean}
 */
export function migrateStoredWritingModel(storage) {
  if (!storage) return false;
  if (storage.getItem(WRITING_MIGRATION_KEY) === "1") return false;
  const model = storage.getItem(WRITING_MODEL_KEY);
  const forget =
    (model !== null && model.trim() === "") ||
    isStoredDefault({
      mode: storage.getItem("cleanupMode") ?? "local",
      provider: storage.getItem(WRITING_PROVIDER_KEY),
      model,
    });
  if (forget) {
    storage.removeItem(WRITING_MODEL_KEY);
    storage.removeItem(WRITING_PROVIDER_KEY);
  }
  storage.setItem(WRITING_MIGRATION_KEY, "1");
  return forget;
}

/**
 * What a local writing model is doing on this Mac, from the main process's
 * report (deviceTier.js `writing`).
 *
 * - "ready": on disk.
 * - "downloading": its download is under way.
 * - "failed": its last download failed (Settings offers it again).
 * - "declined": the person cancelled or deleted it, or deleted another
 *   writing model (`autoDeclined`); Oats does not fetch it by itself.
 * - "missing": not on disk, and nothing stands in the way of fetching it.
 *
 * @param {string} model
 * @param {{ installed?: readonly string[], declined?: readonly string[], autoDeclined?: boolean,
 *   downloading?: { modelId: string } | null, failed?: { modelId: string } | null }} [writing]
 * @returns {"ready" | "downloading" | "failed" | "declined" | "missing"}
 */
export function localWritingStatus(model, writing = {}) {
  if (writing.downloading?.modelId === model) return "downloading";
  if ((writing.installed ?? []).includes(model)) return "ready";
  if (writing.failed?.modelId === model) return "failed";
  if ((writing.declined ?? []).includes(model) || writing.autoDeclined === true) {
    return "declined";
  }
  return "missing";
}

/**
 * Whether to fetch the default local writing model now. Only after setup (or
 * when setup asked for it), only while the writing setting follows the default
 * and runs on this Mac, only once this Mac's memory is known, never while a
 * conversation is recorded (its notice would compete with the room), and only
 * when no writing model is ready: not while another download runs, not after
 * a failure (Settings retries), not after the person cancelled or deleted it,
 * and not after the person removed a writing model at all (`autoDeclined`):
 * removing Qwen3.5 4B must not start Gemma 4 E4B. That lasts until the person
 * chooses a model or presses Download.
 *
 * @param {object} input
 * @param {{ model: string, reason: string } | null} input.choice `defaultWritingModel` for "local".
 * @param {boolean} input.setupDone
 * @param {boolean} input.followsDefault
 * @param {boolean} input.local The writing model runs on this Mac.
 * @param {boolean} [input.recording] A conversation is being recorded.
 * @param {object} [input.writing] The main process's report (`localWritingStatus`).
 * @returns {boolean}
 */
export function shouldFetchWritingModel({
  choice,
  setupDone,
  followsDefault,
  local,
  recording = false,
  writing = {},
}) {
  return (
    Boolean(choice?.model) &&
    choice.reason !== "unknown" &&
    setupDone === true &&
    followsDefault === true &&
    local === true &&
    recording !== true &&
    !writing.downloading &&
    writing.autoDeclined !== true &&
    localWritingStatus(choice.model, writing) === "missing"
  );
}

/**
 * The processing switch moving to `target`: the writing choice it keeps for
 * each side, and the one to restore. The choice in use is kept under the side
 * the writing scope is on, which is also where it is when the switch reads
 * "mixed" (a cloud model with speech on this Mac, for example), so leaving
 * "mixed" never loses it: moving to that side keeps it, and moving to the
 * other side remembers it for the way back. A server of the person's own is
 * on neither side and is not remembered. Null means: follow the default.
 *
 * @template T
 * @param {{ memory: Partial<Record<"local" | "providers", T | null>>,
 *   writingMode: string, stored: T | null, target: "local" | "providers" }} input
 * @returns {{ memory: Partial<Record<"local" | "providers", T | null>>, restore: T | null }}
 */
export function switchWritingSide({ memory, writingMode, stored, target }) {
  const next = { ...memory };
  if (writingMode === "local" || writingMode === "providers") next[writingMode] = stored ?? null;
  return { memory: next, restore: next[target] ?? null };
}

/** Set once the notice of the writing model's automatic download has been shown (localStorage). */
export const WRITING_NOTICE_KEY = "writingModelNoticed";

/**
 * Whether to show the one-time notice that the writing model is downloading:
 * when Oats started the download by itself, not when the person asked for it
 * in Settings or chose it in setup, and once per install.
 *
 * @param {{ noticed: boolean, autoStarted: boolean, downloading: boolean }} input
 * @returns {boolean}
 */
export function shouldShowWritingNotice({ noticed, autoStarted, downloading }) {
  return noticed !== true && autoStarted === true && downloading === true;
}
