// The model a provider's key uses for the two topic jobs, measured on public
// AMI meetings (docs/fast-models.md, "The most accurate model for each topic
// job"):
//
// - `names`: #121's requests (topicNamer.mjs), which name each topic while
//   the conversation is recorded and once more at Finish; and
// - `check`: the live topic check (V4, topicLoop.mjs), which confirms each
//   change of subject the on-device tracker proposes and names the topics it
//   starts.
//
// The person's writing model still writes the summary and the title, sorts
// the conversation into a group and tidies dictation. These two jobs go to the
// provider's most accurate model for them, by the same key and to the same
// host, so they add no destination. Each job has a list, best first, and a key
// gets the first model it can use (`chooseFastModel`, asked once a session). A
// key that can use none of them names topics with the writing model, as
// before, and runs no check. Every other provider keeps #121's names from the
// writing model.
//
// Pure and DOM-free, so it unit-tests under node:test.

import { topicNameConfig } from "./topicNaming.mjs";

/**
 * @typedef {{ model: string, effort: string }} TopicModel
 *   `effort`: OpenAI's reasoning effort, or Anthropic's `output_config.effort`.
 */

const list = (...models) => Object.freeze(models.map((model) => Object.freeze(model)));

/**
 * Best first, per provider and job, as measured on 24 AMI meetings
 * (docs/fast-models.md). Names: a blind judge, two judges twice over 176
 * topics people drew. Check: live Pk of V4 with each model as the checker,
 * against the on-device tracker's 0.356 (lower is better).
 *
 * - OpenAI names: gpt-6-astra 4.25 of 5, then gpt-6.1-sol 4.19, gpt-6.1-terra
 *   4.14 (the default writing model, gpt-5.6-terra, 3.89).
 * - OpenAI check: gpt-5.6-terra 0.255 over three runs, then gpt-6.1-sol 0.280,
 *   gpt-6.1-terra 0.277, gpt-6-luna 0.312.
 * - Anthropic names: claude-opus-5-5 at its default effort, medium, 4.55, then
 *   claude-sonnet-5-5 4.41 (Fable 5.1 4.43 costs five times as much).
 * - Anthropic check: claude-opus-5-5 at effort low 0.268 over two runs (at
 *   medium 0.298), then claude-haiku-5-5 0.316.
 */
export const TOPIC_MODELS = Object.freeze({
  openai: Object.freeze({
    names: list(
      { model: "gpt-6-astra", effort: "low" },
      { model: "gpt-6.1-sol", effort: "low" },
      { model: "gpt-6.1-terra", effort: "none" }
    ),
    check: list(
      { model: "gpt-5.6-terra", effort: "none" },
      { model: "gpt-6.1-terra", effort: "none" },
      { model: "gpt-6.1-sol", effort: "low" },
      { model: "gpt-6-luna", effort: "none" },
      { model: "gpt-5.6-luna", effort: "none" }
    ),
  }),
  anthropic: Object.freeze({
    names: list(
      { model: "claude-opus-5-5", effort: "medium" },
      { model: "claude-sonnet-5-5", effort: "low" }
    ),
    check: list(
      { model: "claude-opus-5-5", effort: "low" },
      { model: "claude-haiku-5-5", effort: "low" }
    ),
  }),
});

/**
 * Output tokens added to an OpenAI request's cap when the model reasons: the
 * reasoning counts against the cap, and one sized for the answer alone (200
 * tokens for a check) would end before the answer starts. Anthropic's route
 * adds its own room for a model that thinks (anthropicMessages.js).
 */
export const REASONING_HEADROOM = 2000;

/**
 * The provider whose topic models a writing route uses: OpenAI's or
 * Anthropic's own API, chosen as the writing model. Null for every other
 * provider, a custom endpoint, a server of the person's own and a model on
 * this computer.
 *
 * @param {{ mode?: string, config?: { provider?: string } } | null | undefined} route
 * @returns {"openai" | "anthropic" | null}
 */
export function topicProvider(route) {
  if (!route || route.mode !== "providers") return null;
  const provider = route.config?.provider;
  return provider === "openai" || provider === "anthropic" ? provider : null;
}

/** The list a key chooses from, for `chooseFastModel`: model ids, best first. */
export function topicModelIds(provider, job) {
  return (TOPIC_MODELS[provider]?.[job] ?? []).map((choice) => choice.model);
}

/** The choice for a model id a key could use, with its settings. */
export function topicModelChoice(provider, job, model) {
  return (TOPIC_MODELS[provider]?.[job] ?? []).find((choice) => choice.model === model) ?? null;
}

/**
 * The settings of one live-check request (topicLoop.mjs's `ask`): the
 * system prompt, the answer as the asked JSON, the model's effort, and room
 * for its reasoning. Thinking stays off where the model allows it.
 *
 * @param {"openai" | "anthropic"} provider
 * @param {TopicModel} choice
 * @param {{ system: string, maxTokens: number, schema: { name: string, schema: object } }} request
 */
export function checkRequestConfig(provider, choice, request) {
  const reasons = provider === "openai" && choice.effort !== "none";
  return {
    provider,
    systemPrompt: request.system,
    maxTokens: reasons ? request.maxTokens + REASONING_HEADROOM : request.maxTokens,
    reasoningEffort: choice.effort,
    responseSchema: request.schema,
    disableThinking: true,
  };
}

/**
 * The settings of one naming request to the provider's naming model: the
 * writing route's own (`topicNameConfig`), with the model's effort and its
 * thinking off where it allows it.
 *
 * @param {TopicModel} choice
 * @param {{ mode: string, config?: object }} route
 * @param {string} system
 */
export function nameRequestConfig(choice, route, system) {
  return {
    ...topicNameConfig(route, system),
    reasoningEffort: choice.effort,
    disableThinking: true,
  };
}
