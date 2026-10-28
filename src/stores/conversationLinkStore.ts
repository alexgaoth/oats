import reasoningService from "../services/ReasoningService";
import type { ReasoningConfig } from "../services/BaseReasoningService";
import { getSettings } from "./settingsStore";
import type { WritingRoute } from "./conversationGroupSortStore";
import { readSnapshot } from "../components/global/boardData";
import { summaryExcerpt } from "../helpers/conversationGroupSort.mjs";
import { linkTexts, MIN_LINK_TOPIC_MS } from "../helpers/conversationLinks.mjs";
import {
  GIST_CHARS,
  LINK_MODELS,
  LINK_REASONING_EFFORT,
  LINK_SCHEMA,
  LINK_TIMEOUT_MS,
  buildLinkPrompt,
  chooseCandidates,
  linkProviderFor,
  linkTopicNames,
  parseLinkAnswer,
  sendableTo,
} from "../helpers/remoteLinks.mjs";
import type { NoteItem } from "../types/electron";
import logger from "../utils/logger";

// The cloud link check: once a conversation is summarized by a cloud writing
// model, that provider's most accurate model says which earlier conversations
// share a subject with it, and names each subject (helpers/remoteLinks.mjs,
// measured in docs/link-eval.md). The board draws those links instead of the
// ones it finds on this computer for that conversation.
//
// Privacy: the summary's rule. Nothing is sent unless the writing model is a
// cloud provider with a link model (OpenAI or Anthropic), and then only to
// that provider, by the summary's own route and key. The request carries the
// topic names and the opening of the summary of this conversation and of at
// most 12 earlier ones: only ones whose summary the same provider already
// wrote (`notes.summary_route`), and of those the most alike it on this
// computer, none that share nothing with it. Never a transcript, a title or
// an id (docs/network-allowlist.md).

/** How many earlier conversations are read to choose from. */
const READ_LIMIT = 1000;
/** Texts per embedding request, as the board asks. */
const EMBED_BATCH = 64;
/** The answer is a short JSON list; a Claude model also thinks before it. */
const LINK_MAX_TOKENS = 4000;

/** The OpenAI link model this session's key can use: undefined until asked. */
let openaiLinkModel: string | null | undefined;

/**
 * The link model this provider's key can use, the most accurate first. For
 * OpenAI it is asked once a session (`GET /v1/models/{model}`, no
 * conversation text), again only when the answer could not be told.
 */
async function linkModelFor(provider: "openai" | "anthropic"): Promise<string | null> {
  const models = LINK_MODELS[provider];
  if (provider !== "openai") return models[0] ?? null;
  if (openaiLinkModel !== undefined) return openaiLinkModel;
  for (const model of models) {
    const available = await reasoningService.openAiModelAvailable(model);
    if (available === true) {
      openaiLinkModel = model;
      return model;
    }
    // Unknown (offline, a server error): try it, and ask again next time.
    if (available === null) return model;
  }
  openaiLinkModel = null;
  return null;
}

/** Topic-name vectors on this computer, or null when the model cannot read them. */
async function vectorsFor(
  texts: string[]
): Promise<((text: string) => Float32Array | null) | null> {
  if (getSettings().preferredLanguage !== "en") return null;
  const embed = window.electronAPI?.embedTexts;
  if (!embed) return null;
  const vectors = new Map<string, Float32Array>();
  for (let index = 0; index < texts.length; index += EMBED_BATCH) {
    const batch = texts.slice(index, index + EMBED_BATCH);
    const result = await embed(batch).catch(() => null);
    if (
      !result?.success ||
      !Array.isArray(result.vectors) ||
      result.vectors.length !== batch.length
    ) {
      return null;
    }
    batch.forEach((text, at) => vectors.set(text, Float32Array.from(result.vectors?.[at] ?? [])));
  }
  return (text: string) => vectors.get(text) ?? null;
}

function described(note: NoteItem) {
  return {
    gist: summaryExcerpt(note.enhanced_content, GIST_CHARS),
    topics: linkTopicNames(readSnapshot(note.conversation_topics), {
      minTopicMs: MIN_LINK_TOPIC_MS,
    }),
  };
}

export type LinkCheckOutcome =
  | { kind: "checked"; candidates: number; links: number; model: string; ms: number }
  | {
      kind: "skipped";
      reason: "not-cloud" | "unavailable" | "gone" | "no-topics" | "no-candidates" | "no-model";
    };

/**
 * Checks which earlier conversations share a subject with this one, and
 * stores the answer on the note. Called once after the summary, by the
 * summary's route; a failure leaves the board's own links, and is not an
 * error for the summary.
 */
export async function checkConversationLinks(
  noteId: number,
  route: WritingRoute
): Promise<LinkCheckOutcome> {
  const provider = linkProviderFor(route) as "openai" | "anthropic" | null;
  if (!provider) return { kind: "skipped", reason: "not-cloud" };
  const api = window.electronAPI;
  if (!api?.getNote || !api.getNotes || !api.updateNote) {
    return { kind: "skipped", reason: "unavailable" };
  }
  const note = await api.getNote(noteId);
  if (!note || note.deleted_at) return { kind: "skipped", reason: "gone" };
  const current = { id: note.id, snapshot: readSnapshot(note.conversation_topics) };
  if (!current.snapshot?.nodes.length) return { kind: "skipped", reason: "no-topics" };

  const notes = (await api.getNotes("meeting", READ_LIMIT)) ?? [];
  // Only conversations this provider has already summarized: a check never
  // sends one it has not read. The rest keep their links on this computer.
  const earlier = notes
    .filter(
      (item) =>
        item.id !== note.id &&
        !item.deleted_at &&
        item.created_at < note.created_at &&
        sendableTo(provider, item)
    )
    .map((item) => ({ note: item, id: item.id, snapshot: readSnapshot(item.conversation_topics) }))
    .filter((item) => item.snapshot?.nodes.length);
  const vectorOf = await vectorsFor(linkTexts([current, ...earlier]));
  const chosen = chooseCandidates(current, earlier, { vectorOf }) as number[];
  const byId = new Map(earlier.map((item) => [item.id, item.note]));
  const candidates = chosen.filter((id) => byId.has(id));
  if (!candidates.length) {
    // Nothing alike enough to ask about: nothing is sent, and the board keeps
    // its own links.
    return { kind: "skipped", reason: "no-candidates" };
  }

  const model = await linkModelFor(provider);
  if (!model) return { kind: "skipped", reason: "no-model" };
  const prompt = buildLinkPrompt({
    current: described(note),
    earlier: candidates.map((id) => ({ id, ...described(byId.get(id) as NoteItem) })),
  });
  const config: ReasoningConfig & { systemPrompt: string } = {
    ...route.config,
    provider,
    systemPrompt: prompt.system,
    maxTokens: LINK_MAX_TOKENS,
    ...(provider === "openai"
      ? { reasoningEffort: LINK_REASONING_EFFORT, responseSchema: LINK_SCHEMA }
      : {}),
  };
  const started = performance.now();
  const answer = await Promise.race([
    reasoningService.processText(prompt.text, model, null, config),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("The link check took too long")), LINK_TIMEOUT_MS)
    ),
  ]);
  const ms = Math.round(performance.now() - started);
  const links = parseLinkAnswer(answer, prompt.keys);
  if (!links) throw new Error("The link check's answer could not be read");
  await api.updateNote(noteId, {
    conversation_links: JSON.stringify({
      checkedAt: new Date().toISOString(),
      model,
      candidates,
      links,
    }),
  });
  // Counts and times only: never a name, a gist or a word of the conversation.
  void logger.debug(
    "Links checked",
    { noteId, provider, model, candidates: candidates.length, links: links.length, ms },
    "conversation-links"
  );
  return { kind: "checked", candidates: candidates.length, links: links.length, model, ms };
}
