// Links found by a cloud model: which earlier conversations talk about the
// same thing as the one just finished, and what that thing is called.
//
// Topics are linked on this computer for everyone (`conversationLinks.mjs`).
// When the person writes with a cloud provider, the provider's most accurate
// model checks those links once a conversation is summarized: it reads the
// new conversation and the earlier ones most alike it, each as the opening of
// its summary (the gist) and the names of its topics, and says which share a
// subject and names it. It never reads a transcript. Measured on the AMI
// meetings in docs/link-eval.md.
//
// Privacy: the same rule as the summary. Nothing is sent unless the writing
// model is a cloud provider, and then only to that provider, with its key:
// the gist and topic names of the new conversation and of at most
// `MAX_CANDIDATES` earlier ones (docs/network-allowlist.md).
//
// This is the pure half: the prompt, reading the answer, and which model to
// ask. The request goes out from `stores/conversationLinkStore.ts`. Pure and
// DOM-free, so it unit-tests under node:test.

import { parseTopicName } from "./topicNaming.mjs";

/** How much of each summary the model reads, in characters: its opening sentence or two. */
export const GIST_CHARS = 300;

/** The most earlier conversations one request asks about. */
export const MAX_CANDIDATES = 12;

/** The most topic names one conversation is given with, the longest-held first. */
export const MAX_TOPICS = 8;

/** A link check that takes longer than this is not waited for. */
export const LINK_TIMEOUT_MS = 90_000;

/**
 * The model each provider's links are checked with, the most accurate first:
 * the first one the person's key can use is asked. On AMI (docs/link-eval.md)
 * Claude Opus 5.5 linked as well as Claude Fable 5.1 at under a third of its
 * cost, and gpt-6.1-sol at reasoning low as well as gpt-6-astra at a fifth;
 * Opus 5.5 drew the fewest false links of all.
 */
export const LINK_MODELS = {
  openai: ["gpt-6.1-sol", "gpt-6-astra", "gpt-5.6-sol"],
  anthropic: ["claude-opus-5-5"],
};

/** OpenAI's reasoning effort for a check: low linked best (and costs least). */
export const LINK_REASONING_EFFORT = "low";

export const LINK_SYSTEM_PROMPT = [
  "You find the earlier conversations that talk about the same thing as a new one.",
  "",
  "You get the new conversation and a list of earlier conversations. Each is given only as a short gist and the names of its topics; you never see what was said.",
  "",
  "Link the new conversation to an earlier one only when a topic of each is about the same specific subject: the same thing, question, problem, decision or plan, discussed in both. Two conversations about one project or product are linked only when the same part of it is discussed in both (its price, its design, one feature, a deadline). A broad area in common is not enough (both about work, about software, about a product). Meeting routine never links: greetings, introductions, the agenda, scheduling, the wrap-up.",
  "",
  "For each link, name the shared subject in 2 to 5 words: specific, in sentence case, in the language of the topic names, with no quotation marks.",
  "",
  "Reply with JSON only, listing only the linked earlier conversations (an empty list when none is linked):",
  '{"links":[{"conversation":"B","subject":"Remote control button layout","topic":"<the new conversation\'s topic>","earlier_topic":"<the earlier conversation\'s topic>"}]}',
].join("\n");

/** The answer's shape, for providers that take a JSON schema. */
export const LINK_SCHEMA = {
  name: "conversation_links",
  schema: {
    type: "object",
    properties: {
      links: {
        type: "array",
        items: {
          type: "object",
          properties: {
            conversation: { type: "string" },
            subject: { type: "string" },
            topic: { type: "string" },
            earlier_topic: { type: "string" },
          },
          required: ["conversation", "subject", "topic", "earlier_topic"],
          additionalProperties: false,
        },
      },
    },
    required: ["links"],
    additionalProperties: false,
  },
};

const oneLine = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** The letter an earlier conversation is called by: A to Z, then AA, AB… */
export function candidateKey(index) {
  let key = "";
  let rest = index;
  do {
    key = String.fromCharCode(65 + (rest % 26)) + key;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return key;
}

/**
 * The topic names a conversation is described by: the longest-held first,
 * without repeats, at most `MAX_TOPICS`.
 *
 * @param {{ nodes?: Array<{ label?: string, durationMs?: number }> } | null | undefined} snapshot
 * @param {{ minTopicMs?: number }} [options]
 */
export function linkTopicNames(snapshot, { minTopicMs = 0 } = {}) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const names = [];
  for (const node of [...nodes].sort((a, b) => (b?.durationMs ?? 0) - (a?.durationMs ?? 0))) {
    const name = oneLine(node?.label);
    if (!name || (node?.durationMs ?? 0) < minTopicMs) continue;
    if (!names.some((other) => other.toLowerCase() === name.toLowerCase())) names.push(name);
    if (names.length >= MAX_TOPICS) break;
  }
  return names;
}

function describe(title, { gist, topics }) {
  const lines = [title];
  const text = oneLine(gist).slice(0, GIST_CHARS);
  if (text) lines.push(`Gist: ${text}`);
  lines.push(`Topics: ${topics.length ? topics.map(oneLine).join("; ") : "none named"}`);
  return lines.join("\n");
}

/**
 * The request: the new conversation, then the earlier ones, each called by a
 * letter so no id or title of the person's leaves the computer.
 *
 * @param {{ current: { gist?: string, topics: string[] },
 *   earlier: Array<{ id: unknown, gist?: string, topics: string[] }> }} input
 * @returns {{ system: string, text: string, keys: Map<string, unknown> }}
 */
export function buildLinkPrompt({ current, earlier }) {
  const keys = new Map();
  const blocks = (Array.isArray(earlier) ? earlier : [])
    .slice(0, MAX_CANDIDATES)
    .map((item, index) => {
      const key = candidateKey(index);
      keys.set(key, item.id);
      return describe(key, item);
    });
  const text = [
    describe("New conversation", current),
    "",
    "Earlier conversations",
    "",
    blocks.join("\n\n"),
  ].join("\n");
  return { system: LINK_SYSTEM_PROMPT, text, keys };
}

/** The first JSON object in an answer: as is, in a code fence, or between the outermost braces. */
function readJson(answer) {
  const raw = String(answer ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const tries = [raw];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fence) tries.push(fence[1]);
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) tries.push(raw.slice(first, last + 1));
  for (const candidate of tries) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object") return value;
    } catch {}
  }
  return null;
}

/**
 * The links in an answer, one per earlier conversation, each with the
 * subject's name. A subject the name rules refuse (too long, generic) is
 * named by the earlier conversation's topic instead; a conversation the
 * request did not ask about is ignored. Null when the answer is not the
 * asked JSON at all, so a failed check is told from "no links".
 *
 * @param {unknown} answer
 * @param {Map<string, unknown>} keys
 * @returns {Array<{ id: unknown, subject: string, topic: string, earlierTopic: string }> | null}
 */
export function parseLinkAnswer(answer, keys) {
  const value = readJson(answer);
  if (!value || !Array.isArray(value.links)) return null;
  const links = [];
  for (const item of value.links) {
    const key = oneLine(item?.conversation).toUpperCase();
    if (!keys.has(key) || links.some((link) => link.id === keys.get(key))) continue;
    const topic = oneLine(item?.topic);
    const earlierTopic = oneLine(item?.earlier_topic);
    const subject = parseTopicName(oneLine(item?.subject)) ?? (earlierTopic || topic);
    if (!subject) continue;
    links.push({ id: keys.get(key), subject, topic, earlierTopic });
  }
  return links;
}

/** The provider of a writing route whose links a cloud model may check, or null. */
export function linkProviderFor(route) {
  if (!route || route.mode !== "providers") return null;
  const provider = route.config?.provider;
  return Object.prototype.hasOwnProperty.call(LINK_MODELS, provider) ? provider : null;
}
