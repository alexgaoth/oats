// Whether a finished conversation can be summarized, and if not, why.
//
// The title, the summary and the threads are what Oats promises after Finish,
// and on a fresh install none of them could happen: the summary model is empty
// until somebody picks one, and choosing "On this computer" names a model
// without downloading it. The failure surfaced as a toast in a window nobody had
// open, and the record said "Intelligence is being prepared" forever.
//
// Pure, so the rule can be pinned; `useSummaryReadiness` gathers the facts.

export type SummaryReadiness = "ready" | "no-model" | "model-missing" | "no-endpoint";

export interface SummaryFacts {
  /** InferenceMode for note formatting: "local" | "providers" | "self-hosted". */
  mode: string;
  model: string;
  remoteUrl: string;
  /** Whether the local model's file is on disk; null when it could not be checked. */
  localModelDownloaded: boolean | null;
}

/**
 * "ready", the reason it is not, or null when it could not be told.
 *
 * Unknown is never reported as a problem — a warning that is wrong costs more
 * than the silence it replaces (the same rule `preflight.ts` keeps).
 */
export function summaryReadiness(facts: SummaryFacts): SummaryReadiness | null {
  if (facts.mode === "self-hosted") {
    return facts.remoteUrl.trim() ? "ready" : "no-endpoint";
  }
  if (!facts.model.trim()) return "no-model";
  if (facts.mode === "local") {
    if (facts.localModelDownloaded === false) return "model-missing";
    if (facts.localModelDownloaded === null) return null;
  }
  return "ready";
}
