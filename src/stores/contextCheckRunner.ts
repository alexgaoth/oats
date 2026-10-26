import reasoningService from "../services/ReasoningService";
import { currentWritingRoute, writingModelReady } from "./conversationGroupSortStore";
import {
  CHECK_SYSTEM_PROMPT,
  MAX_PASSAGES,
  buildCheckPrompt,
  checkFromAgent,
  parseCheckVerdict,
} from "../helpers/contextCheck.mjs";
import type { ContextCheck, ContextPassage } from "../types/conversationEvents";
import logger from "../utils/logger";

// One context check, as the aide session runs it (`checkContext` in
// conversationAide.mjs): find the passages that could settle the question
// (contextService.js, in main), then ask the writing model whether they agree
// with the reply (contextCheck.mjs). When the team's context has nothing to
// say and the agent is on, the question goes to the user's Claude Code, which
// reads GitHub, Linear, Notion and Slack read-only (contextAgentRunner.js).
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

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("The context check timed out")), ms);
  });
  return Promise.race([work, timeout]).finally(() => window.clearTimeout(timer));
}

/** Agent runs left in this recording (AGENT_RUNS_PER_RECORDING at the start). */
export interface AgentBudget {
  left: number;
}

/**
 * The card's check for one reply, or null when there is nothing to say: no
 * strong match in the context and no agent, no writing model, or a verdict
 * that could not show its source.
 */
export async function runContextCheck(
  input: ContextCheckInput,
  onProgress: (check: ContextCheck) => void,
  { agent = null }: { agent?: AgentBudget | null } = {}
): Promise<ContextCheck | null> {
  const local = await checkLocally(input, onProgress);
  if (local) return local;
  if (!agent || agent.left <= 0) return null;
  return askAgent(input, onProgress, agent);
}

/** The team folder and past conversations, judged by the writing model. */
async function checkLocally(
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

/**
 * The user's Claude Code, when the local context had nothing (contextAgent.mjs
 * says what it may touch). Its progress names the services it reads, so the
 * card says "Checking Linear" rather than a spinner with no subject.
 */
async function askAgent(
  input: ContextCheckInput,
  onProgress: (check: ContextCheck) => void,
  budget: AgentBudget
): Promise<ContextCheck | null> {
  const api = window.electronAPI;
  if (!api?.contextAgentCheck) return null;
  const status = await api.contextAgentStatus?.();
  if (!status?.available) return null;
  budget.left -= 1;
  const checkId = `${input.noteId ?? "note"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  onProgress({ state: "checking", by: "agent", sources: [] });
  const stop = api.onContextAgentProgress?.((progress) => {
    if (progress.checkId === checkId) {
      onProgress({ state: "checking", by: "agent", sources: progress.sources });
    }
  });
  const started = performance.now();
  try {
    const result = await api.contextAgentCheck({
      checkId,
      question: input.question,
      reply: input.reply,
      outcome: input.outcome === "denied" ? "denied" : "uncertain",
    });
    void logger.debug(
      "Context agent",
      {
        result: !result ? "none" : "reason" in result ? result.reason : result.verdict.verdict,
        ms: Math.round(performance.now() - started),
      },
      "context"
    );
    return checkFromAgent(result);
  } finally {
    stop?.();
  }
}
