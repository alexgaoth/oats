// Checks a reply heard in the room against the team's context: is it right, is
// it wrong, or did the context answer a question nobody could?
//
// The check runs after the aide has decided a question's outcome, and only for
// the outcomes where somebody was not sure: a hedged or short reply
// (`uncertain`) and "I don't know" (`denied`). A confident answer is a record,
// not something to second-guess beside a live conversation.
//
// The verdict is the model's, but the evidence is not. The model must quote the
// passage it relies on, and the quote must appear in that passage, or there is
// no card. A card that says "Wait, that's wrong" in front of a colleague has to
// be able to show its source, so a verdict without one is worse than silence.
//
// Pure, so it is tested.

/** The outcomes worth checking: somebody was asked and was not sure. */
export const CHECK_OUTCOMES = new Set(["uncertain", "denied"]);

/** The verdicts a card can show. `unclear` and anything malformed show nothing. */
export const CHECK_VERDICTS = new Set(["right", "wrong", "answer"]);

/** How many passages the judge reads. More is slower on a small local model. */
export const MAX_PASSAGES = 4;

/** A passage is cut to this many characters before it reaches the judge. */
export const MAX_PASSAGE_CHARS = 700;

export const CHECK_SYSTEM_PROMPT =
  "You check what was said in a meeting against the team's own notes. Use only the notes. Follow the JSON contract exactly.";

/** @param {string} outcome The aide's verdict for the question. */
export function shouldCheck(outcome) {
  return CHECK_OUTCOMES.has(outcome);
}

const clip = (text, max) => {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

/**
 * The judge's prompt.
 *
 * @param {{ question: string, reply: string, outcome: string,
 *   passages: { label: string, text: string }[] }} input
 */
export function buildCheckPrompt({ question, reply, outcome, passages }) {
  const notes = passages
    .slice(0, MAX_PASSAGES)
    .map(
      (passage, index) =>
        `[${index + 1}] ${passage.label}: ${clip(passage.text, MAX_PASSAGE_CHARS)}`
    )
    .join("\n");
  const heard =
    outcome === "denied" || !String(reply || "").trim()
      ? "Nobody in the room knew."
      : `"${clip(reply, 400)}"`;
  return `Question asked in the meeting:
"${clip(question, 300)}"

Reply in the meeting:
${heard}

Notes:
${notes}

Reply with one JSON object and nothing else:
{"verdict":"right"|"wrong"|"answer"|"unclear","answer":string,"note":number,"quote":string}
- "right": the notes agree with the reply.
- "wrong": the notes say something different from the reply.
- "answer": nobody knew, and the notes answer the question.
- "unclear": the notes do not settle it.
"answer" is the answer from the notes in at most 12 words. "note" is the number of the note you used. "quote" is the exact words from that note that show it, at most 25 words.`;
}

// Quotes are compared on words, not on typography: a model will turn a curly
// apostrophe straight, drop a markdown asterisk or change the case of the first
// word, and none of that makes the quote less true.
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*_~#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'.,;:!?…\s-]+|["'.,;:!?…\s-]+$/g, "");
}

/** True when `quote` appears, word for word, in `text`. */
export function quoteAppears(quote, text) {
  const needle = normalize(quote);
  if (needle.split(" ").length < 2) return false;
  return normalize(text).includes(needle);
}

function firstJsonObject(raw) {
  const text = String(raw || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Reads the judge's reply. Returns null for "unclear" and for anything that
 * does not hold up: an unknown verdict, no quote, or a quote that is not in the
 * notes.
 *
 * @param {string} raw The model's text.
 * @param {{ passages: { text: string }[], outcome: string }} context
 * @returns {{ verdict: "right" | "wrong" | "answer", answer: string, quote: string, passage: number } | null}
 */
export function parseCheckVerdict(raw, { passages, outcome }) {
  const parsed = firstJsonObject(raw);
  if (!parsed || !CHECK_VERDICTS.has(parsed.verdict)) return null;
  const quote = clip(parsed.quote, 400);
  if (!quote || quote.split(" ").length > 40) return null;

  const shown = passages.slice(0, MAX_PASSAGES);
  // The quote decides which note it came from. A model that numbers its note
  // wrong but quotes it exactly is still right about the notes.
  const cited = Number.isInteger(parsed.note) ? parsed.note - 1 : -1;
  let passage = -1;
  if (cited >= 0 && cited < shown.length && quoteAppears(quote, shown[cited].text)) passage = cited;
  else passage = shown.findIndex((item) => quoteAppears(quote, item.text));
  if (passage < 0) return null;

  // Nobody answered, so there is nothing to call right or wrong: what the notes
  // hold is the answer.
  const verdict = outcome === "denied" ? "answer" : parsed.verdict;
  const answer = clip(parsed.answer, 160) || quote;
  return { verdict, answer, quote, passage };
}

/** Agent runs one recording may start: each is a Claude Code session. */
export const AGENT_RUNS_PER_RECORDING = 6;

/**
 * The card's check from the agent's answer (contextAgent.mjs,
 * `parseAgentVerdict`), or null when it had none. The agent's source is a
 * page Oats cannot read, so its words are shown as the agent gave them and
 * its link is the evidence.
 *
 * @param {{ ok: boolean, verdict?: { verdict: string, answer: string, quote?: string,
 *   source: { title: string, url: string } } } | null | undefined} result
 * @returns {{ state: "right" | "wrong" | "answer", by: "agent", answer: string, quote: string,
 *   source: { kind: "link", url: string, label: string } } | null}
 */
export function checkFromAgent(result) {
  const verdict = result?.ok ? result.verdict : null;
  if (!verdict || !CHECK_VERDICTS.has(verdict.verdict)) return null;
  const url = String(verdict.source?.url || "");
  if (!/^https:\/\//i.test(url) || !String(verdict.answer || "").trim()) return null;
  return {
    state: verdict.verdict,
    by: "agent",
    answer: clip(verdict.answer, 160),
    quote: clip(verdict.quote, 400),
    source: { kind: "link", url, label: clip(verdict.source.title, 120) || new URL(url).hostname },
  };
}
