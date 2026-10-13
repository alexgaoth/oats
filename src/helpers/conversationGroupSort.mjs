// Choosing a conversation's group with the writing model: the prompt, and how
// the answer is read. Pure and DOM-free, so both are pinned by tests; the
// call itself is made by `stores/conversationGroupSortStore.ts`, through the
// same reasoning service and the same route as the summary and the title.
//
// The prompt is small on purpose. The default writing model runs on this
// computer, and what it reads before it answers is most of the time it takes:
// the title, the topic labels and the opening of the summary, never the
// transcript. About 150 to 250 tokens for a typical conversation.
//
// The answer is read strictly: one of the names it was given, ignoring case
// and punctuation, or "none". Anything else leaves the conversation in no
// group, rather than guessing which group the model meant.

/** What the model is told it is doing. */
export const GROUP_SORT_SYSTEM_PROMPT =
  "You sort conversations into groups. Reply with exactly one group name from the list, " +
  'or "none" if no group fits. Reply with the name only.';

/** How much of the summary the model reads, in characters. */
export const SUMMARY_EXCERPT_CHARS = 600;

/** How many topic labels the model reads, the longest-held first. */
export const MAX_TOPIC_LABELS = 6;

/** The answer that means "no group fits". */
export const NO_GROUP_ANSWER = "none";

// Sentence ends in the ten shipped languages: Latin and Cyrillic punctuation
// followed by a space, and the CJK full stops, which need none.
const SENTENCE_END = /[.!?](?=\s)|[。！？]/g;

/**
 * A summary as plain prose: headings dropped whole (a heading's words are not
 * a sentence anybody wrote), list markers, emphasis and links unwrapped, and
 * cut at the last sentence end before `max` characters.
 *
 * @param {string | null | undefined} markdown
 * @param {number} [max]
 * @returns {string} "" when there is no summary.
 */
export function summaryExcerpt(markdown, max = SUMMARY_EXCERPT_CHARS) {
  const text = String(markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, " ")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[*`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  let cut = -1;
  for (const match of head.matchAll(SENTENCE_END)) cut = match.index + match[0].length;
  if (cut > max / 3) return head.slice(0, cut).trim();
  const space = head.lastIndexOf(" ");
  return `${(space > max / 2 ? head.slice(0, space) : head).trim()}…`;
}

/**
 * The topic labels of a stored topic snapshot (`notes.conversation_topics`),
 * the longest-held first, without repeats.
 *
 * @param {string | object | null | undefined} snapshot JSON text or the object.
 * @param {number} [max]
 * @returns {string[]}
 */
export function topicLabels(snapshot, max = MAX_TOPIC_LABELS) {
  let parsed = snapshot;
  if (typeof snapshot === "string") {
    try {
      parsed = JSON.parse(snapshot);
    } catch {
      return [];
    }
  }
  const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
  const labels = [];
  const seen = new Set();
  for (const node of [...nodes].sort(
    (a, b) => (Number(b?.durationMs) || 0) - (Number(a?.durationMs) || 0)
  )) {
    const label = typeof node?.label === "string" ? node.label.replace(/\s+/g, " ").trim() : "";
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length >= max) break;
  }
  return labels;
}

/**
 * The request: the system prompt and the text the model answers.
 *
 * @param {{ title?: string | null, summary: string, topics?: string[], groups: string[] }} input
 *   `groups` are the names as the person sees them, in their order. `title`
 *   is left out when it is only a placeholder.
 * @returns {{ systemPrompt: string, text: string }}
 */
export function buildGroupSortPrompt({ title = null, summary, topics = [], groups }) {
  const lines = ["Groups:", ...groups.map((name) => `- ${name}`), ""];
  if (title && title.trim()) lines.push(`Title: ${title.trim()}`);
  if (topics.length) lines.push(`Topics: ${topics.join(", ")}`);
  lines.push(
    `Summary: ${summary}`,
    "",
    `Which group? Answer with one name from the list, or none.`
  );
  return { systemPrompt: GROUP_SORT_SYSTEM_PROMPT, text: lines.join("\n") };
}

// Punctuation, and the symbols a model wraps a name in (backticks, markdown
// emphasis, angle brackets). Letters, digits and emoji stay.
const IGNORED = /[\p{P}`^~|<>=+]+/gu;

/** A name or an answer as the two are compared: case and punctuation ignored. */
export function comparableName(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(IGNORED, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read the model's answer.
 *
 * Strict: the whole answer must be one of `groups` or "none", ignoring case
 * and punctuation (`**Work**.` is Work). "Group: Work", "Work, probably" or a
 * name that two groups share is unreadable, and an unreadable answer leaves
 * the conversation in no group. A thinking block, if the model wrote one, is
 * not part of the answer.
 *
 * @param {string | null | undefined} answer
 * @param {string[]} groups The names the prompt listed, in its order.
 * @returns {{ kind: "group", index: number } | { kind: "none" } | { kind: "unreadable" } | { kind: "empty" }}
 *   "empty": the model said nothing at all, which is a failed call, not an answer.
 */
export function parseGroupSortAnswer(answer, groups) {
  const said = String(answer ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "");
  const key = comparableName(said);
  if (!key) return { kind: "empty" };
  if (key === NO_GROUP_ANSWER) return { kind: "none" };
  const matches = groups
    .map((name, index) => (comparableName(name) === key ? index : -1))
    .filter((index) => index >= 0);
  return matches.length === 1 ? { kind: "group", index: matches[0] } : { kind: "unreadable" };
}

/**
 * Sort conversations in the background, one at a time.
 *
 * Everything it touches is passed in, so the order of things is pinned by
 * tests with a stub model (`stores/conversationGroupSortStore.ts` passes the
 * real ones):
 *
 * - Before each conversation it waits while `busy()` (a recording, or a
 *   summary using the model), and stops when `stopped()` (the app is
 *   quitting) or when `ready()` is not `true` (the model went away; its
 *   answer is the reason).
 * - `sortOne(id)` asks the model and writes its answer. It throws when the
 *   model fails, and the run stops there rather than failing once per
 *   conversation. It may return `{ kind: "skipped", reason: "yielded" }`
 *   when something needed the model first; that conversation is tried again.
 * - `progress(state)` hears "running" before each conversation (current is
 *   1-based: "Sorting 4 of 37"), then "done" or "stopped" once.
 *
 * @param {{ ids: number[], ready: () => Promise<true | string> | true | string,
 *   busy: () => boolean, stopped: () => boolean, waitForModel: () => Promise<void>,
 *   sortOne: (id: number) => Promise<unknown>, progress: (state: object) => void }} deps
 * @returns {Promise<{ state: "done", done: number, total: number }
 *   | { state: "stopped", reason: string, done: number, total: number }>}
 */
export async function runGroupSortBackfill({
  ids,
  ready,
  busy,
  stopped,
  waitForModel,
  sortOne,
  progress,
}) {
  const total = ids.length;
  let done = 0;
  const finish = (result) => {
    progress(result);
    return result;
  };
  const stop = (reason) => finish({ state: "stopped", reason, done, total });

  for (let index = 0; index < total;) {
    while (busy()) {
      if (stopped()) return stop("stopped");
      await waitForModel();
    }
    if (stopped()) return stop("stopped");
    const verdict = await ready();
    if (verdict !== true) return stop(typeof verdict === "string" ? verdict : "no-model");
    progress({ state: "running", current: done + 1, total });
    let outcome;
    try {
      outcome = await sortOne(ids[index]);
    } catch {
      return stop("model-failed");
    }
    if (outcome?.kind === "skipped" && outcome.reason === "yielded") continue;
    done += 1;
    index += 1;
  }
  return finish({ state: "done", done, total });
}

/**
 * What a run says while it runs, e.g. "Sorting 4 of 37", or null when there
 * is nothing to say.
 *
 * @param {{ state: string, current?: number, total?: number }} progress
 * @param {(key: string, options?: object) => string} t
 */
export function sortProgressLabel(progress, t) {
  if (progress?.state !== "running") return null;
  return t("oats.groups.sorting", { current: progress.current, total: progress.total });
}
