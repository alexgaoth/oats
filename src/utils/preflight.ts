// What has to be true before a conversation can be recorded, and which single
// thing to say when something is not.
//
// Pure, so the decision can be checked without a microphone, a model, or an
// Electron window — `useConversationPreflight` gathers the facts and this
// decides what they mean.

export type PreflightProblem =
  | "no-microphone"
  | "microphone-permission"
  | "no-speech-engine"
  | "no-model"
  | "no-api-key"
  | "no-summary-model"
  | "question-cards-off";

export interface PreflightFacts {
  /** How many audio input devices the browser can see. */
  audioInputs: number;
  /** Microphone permission, where the platform reports it. */
  micPermission: "granted" | "denied" | "prompt" | "unknown";
  /** The *meeting* scope — the one recording a conversation actually reads. */
  useLocalWhisper: boolean;
  localProvider: string;
  /** null when the check could not be run; never treated as a failure. */
  speechEngineReady: boolean | null;
  anyModelDownloaded: boolean | null;
  hasApiKey: boolean | null;
  /** Whether question cards will fire for this conversation. The aide fails
   *  silently when its gate is closed — this is the one place that says so
   *  while there is still time to change it. */
  questionCardsOn: boolean | null;
  /** Whether the title and summary can be written after Finish. Without them
   *  the conversation is saved untitled and is never filed to the vault. */
  summaryReady: boolean | null;
}

/**
 * The one problem worth saying, or null.
 *
 * Order is the point. A missing microphone makes everything else irrelevant, and
 * a screen listing three problems is a configuration report — the person about
 * to sit down with somebody will read one line.
 *
 * Every check that could not be *run* returns null rather than a problem. A
 * false alarm here costs a real conversation, which is much more expensive than
 * the failure it would have warned about.
 */
export function resolvePreflight(facts: PreflightFacts): PreflightProblem | null {
  if (facts.audioInputs === 0) return "no-microphone";
  if (facts.micPermission === "denied") return "microphone-permission";

  if (!facts.useLocalWhisper) {
    if (facts.hasApiKey === false) return "no-api-key";
  } else if (facts.localProvider === "whisper") {
    // Parakeet keeps its models elsewhere and has its own readiness path.
    // Claiming a Whisper model is missing when the engine is not Whisper would
    // be a lie in the one place that must not tell one.
    if (facts.speechEngineReady === false) return "no-speech-engine";
    // Only "nothing at all" is worth saying: a *named* model that is missing
    // while another is present still records, because the resolver falls back.
    if (facts.anyModelDownloaded === false) return "no-model";
  }
  // Recording still works fully without a summary model, but what Oats promises
  // after Finish — a title, a summary, the threads — will not happen, and that
  // used to be discovered at the end, as a toast in a hidden window.
  if (facts.summaryReady === false) return "no-summary-model";
  // Last, because recording still works fully — but the flagship surface will
  // not, and its own failure mode is silence.
  if (facts.questionCardsOn === false) return "question-cards-off";
  return null;
}

/** Whether the problem makes starting pointless rather than merely risky. */
export function blocksRecording(problem: PreflightProblem | null): boolean {
  return problem === "no-microphone";
}
