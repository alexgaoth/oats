// The request for one topic's gist, for `scripts/topic-gist-eval.mjs`: what goes
// into `src/helpers` if a gist clears the bar in `docs/topics-round-2.md`.

import { topicExcerpt } from "../../src/helpers/topicNaming.mjs";

const RULES = [
  "- State what was said, proposed or decided: the point of this part, not that people talked about it.",
  "- Use only what the lines say. Never add a name, a number, a decision or a reason they do not state. If something was only suggested, say it was suggested.",
  "- Who said a line is not known: do not name speakers or roles.",
  "- No heading, no quotation marks, no list.",
];

export const GIST_SYSTEM_VARIANTS = {
  v1: [
    "You write the gist of one topic of a recorded conversation: what a person who was there wants to remember of it. You get what was said on that topic, transcribed by speech recognition, so expect errors, filler and half sentences.",
    "",
    "Reply with the gist only: one or two plain sentences, at most 35 words in all.",
    ...RULES,
  ].join("\n"),
  // For a small model that writes in fragments: full sentences, and the group as the subject.
  v2: [
    "You write the gist of one topic of a recorded conversation: what a person who was there wants to remember of it. You get what was said on that topic, transcribed by speech recognition, so expect errors, filler and half sentences.",
    "",
    "Reply with the gist only: two complete sentences with correct grammar and capital letters, at most 40 words in all. Write them like a note in minutes, for example: The group compared two battery options. They chose the smaller one because it is cheaper.",
    ...RULES,
  ].join("\n"),
};

// For recognized text: what looks misheard is left out, not repaired.
GIST_SYSTEM_VARIANTS.v3 = [
  "You write the gist of one topic of a recorded conversation: what a person who was there wants to remember of it. You get what was said on that topic, transcribed by speech recognition. Many words may be wrong or missing.",
  "",
  "Reply with the gist only: one or two plain sentences, at most 35 words in all.",
  ...RULES,
  "- A number, name or claim that looks misheard or does not fit is left out, not repaired. When little is clear, say only what is clear, in general words.",
].join("\n");

// For a small model that stops short: two sentences, each with a job.
GIST_SYSTEM_VARIANTS.v4 = [
  "You write the gist of one topic of a recorded conversation: what a person who was there wants to remember of it. You get what was said on that topic, transcribed by speech recognition, so expect errors, filler and half sentences.",
  "",
  "Reply with the gist only: two plain sentences, 25 to 35 words in all. The first says what was talked about and the main point made. The second gives what was decided or left open, or the next most important detail.",
  ...RULES,
].join("\n");

/** @param {{ turns: string[], budget?: number, variant?: string }} input */
export function buildGistPrompt({ turns, budget = 3000, variant = "v1" }) {
  const excerpt = topicExcerpt(turns, { budget });
  return {
    system: GIST_SYSTEM_VARIANTS[variant],
    text: ["What was said on this topic:", ...excerpt.map((line) => `- ${line}`)].join("\n"),
    excerpt,
  };
}

/** The gist in an answer: one paragraph, at most 60 words, or null. */
export function parseTopicGist(raw) {
  const text = String(raw ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*(gist|summary)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  if (!text) return null;
  const words = text.split(" ");
  return words.length > 60 ? `${words.slice(0, 60).join(" ")}…` : text;
}
