import reasoningService from "../services/ReasoningService";
import { getSettings, selectResolvedNoteFormatting } from "./settingsStore";
import { currentWritingRoute } from "./conversationGroupSortStore";
import { localSummaryModelDownloaded } from "../hooks/useSummaryReadiness";
import { summaryReadiness } from "../utils/summaryReadiness";
import {
  CHECK_SYSTEM_PROMPT,
  MAX_PASSAGES,
  buildCheckPrompt,
  parseCheckVerdict,
} from "../helpers/contextCheck.mjs";
import type { ContextCheck, ContextPassage } from "../types/conversationEvents";
import logger from "../utils/logger";

// One context check, as the aide session runs it (`checkContext` in
// conversationAide.mjs): find the passages that could settle the question
// (contextService.js, in main), then ask the writing model whether they agree
// with the reply (contextCheck.mjs).
//
// The judge is the writing model Settings already names, the one that writes
// summaries: a person makes one processing choice, not one per feature
// (CLAUDE.md). On this computer it answers one request at a time, and the
// question classifier and the summary queue with it (oneAtATime.js).

/** A judge that takes longer than this has missed the moment it was for. */
const JUDGE_TIMEOUT_MS = 20000;

/** The verdict is one short JSON object. */
const JUDGE_MAX_TOKENS = 200;

export interface ContextCheckInput {
  question: string;
  reply: string;
  outcome: string;
  noteId: number | null;
}

/** Whether the writing model can answer now: chosen, and on disk if local. */
async function writingModelReady(): Promise<boolean> {
  if (!currentWritingRoute()) return false;
  const noteFormatting = selectResolvedNoteFormatting(getSettings());
  const verdict = summaryReadiness({
    mode: noteFormatting.mode,
    model: noteFormatting.model,
    remoteUrl: noteFormatting.remoteUrl,
    localModelDownloaded: await localSummaryModelDownloaded(
      noteFormatting.mode,
      noteFormatting.model
    ),
  });
  // Unknown (null) is let through: the call itself will say.
  return verdict === "ready" || verdict === null;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("The context check timed out")), ms);
  });
  return Promise.race([work, timeout]).finally(() => window.clearTimeout(timer));
}

/**
 * The card's check for one reply, or null when there is nothing to say: no
 * strong match in the context, no writing model, or a verdict that could not
 * show its source.
 */
export async function runContextCheck(
  input: ContextCheckInput,
  onProgress: (check: ContextCheck) => void
): Promise<ContextCheck | null> {
  const found = await window.electronAPI?.searchContext?.({
    question: input.question,
    noteId: input.noteId,
  });
  const passages: ContextPassage[] = found?.success ? found.passages.slice(0, MAX_PASSAGES) : [];
  if (!passages.length) return null;
  if (!(await writingModelReady())) return null;
  const route = currentWritingRoute();
  if (!route) return null;

  onProgress({ state: "checking", by: "context" });
  const prompt = buildCheckPrompt({
    question: input.question,
    reply: input.reply,
    outcome: input.outcome,
    passages,
  });
  const capped = route.mode !== "providers" && route.config.disableThinking !== false;
  const started = performance.now();
  const answer = await withTimeout(
    reasoningService.processText(prompt, route.modelId, null, {
      ...route.config,
      systemPrompt: CHECK_SYSTEM_PROMPT,
      temperature: 0,
      ...(capped ? { maxTokens: JUDGE_MAX_TOKENS } : {}),
    }),
    JUDGE_TIMEOUT_MS
  );
  const read = parseCheckVerdict(answer, { passages, outcome: input.outcome });
  void logger.debug(
    "Context check",
    {
      passages: passages.length,
      verdict: read?.verdict ?? "none",
      ms: Math.round(performance.now() - started),
    },
    "context"
  );
  if (!read) return null;
  return {
    state: read.verdict,
    by: "context",
    answer: read.answer,
    quote: read.quote,
    source: passages[read.passage].source,
  };
}
