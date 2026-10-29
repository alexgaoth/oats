// OpenAI, for a demo whose writing model is OpenAI's (`loop=1`, settings.mjs).
//
// With OpenAI as the writing model the app runs the live topic check
// (`src/helpers/topicLoop.mjs`): once a session it asks whether the key can use
// a check model (`GET /v1/models/{model}`, `src/helpers/topicModels.mjs`), and
// during the conversation it sends that model the proposed changes of subject.
// The summary, the title and the group go to the writing model by the same
// host. The topic names at Finish go to OpenAI's naming model when the key can
// use it; this demo key can use the check models only, so they go to the
// writing model. Here every request to api.openai.com is answered in the page and none
// leaves it: the check and its first names by the stand-ins in topicNames.mjs,
// everything else by the replay's own stub (`hooks.reason`, replay.mjs), as the
// model on this computer is answered in the other demos.
//
// `requests()` lists what was asked, by kind and size, so a run can show the
// check's requests and that none carries more than 3,000 characters of what
// was said.

import { CHECK_SYSTEM, FAST_MODELS, FIRST_NAME_SYSTEM } from "../../src/helpers/topicLoop.mjs";
import { demoTopicCheck, demoTopicFirstName } from "./topicNames.mjs";

const HOST = "https://api.openai.com/";

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The conversation a check quotes: its numbered lines, in characters. */
function quotedChars(user) {
  return String(user)
    .split("\n")
    .map((line) => /^(?:[AB]\d+\. |- )(.*)$/.exec(line)?.[1] ?? "")
    .reduce((total, line) => total + line.length, 0);
}

/**
 * Answers api.openai.com in this page. `reason({ text, prompt })` answers the
 * writing model's requests ({ text, delayMs } or null); `models` are the fast
 * models this demo key can use.
 */
export function installFakeOpenAI({ reason, models = FAST_MODELS }) {
  const requests = [];
  const pageFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(HOST)) return pageFetch(input, init);
    const path = new URL(url).pathname;
    const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      const model = /^\/v1\/models\/(.+)$/.exec(path)?.[1];
      // The provider's own probe of the server (`/v1/models`): an empty list.
      if (!model) return reply(200, { object: "list", data: [] });
      const id = decodeURIComponent(model);
      requests.push({ kind: "model check", model: id, chars: 0 });
      return models.includes(id)
        ? reply(200, { id, object: "model", owned_by: "openai" })
        : reply(404, { error: { message: `The model \`${id}\` does not exist.` } });
    }
    let body = {};
    try {
      body = JSON.parse(String(init.body ?? "{}"));
    } catch {}
    const messages = body.input ?? body.messages ?? [];
    const system = String(messages.find((message) => message.role === "system")?.content ?? "");
    const user = String(messages.find((message) => message.role === "user")?.content ?? "");
    let kind = "writing model";
    let answer;
    if (system === CHECK_SYSTEM) {
      kind = "topic check";
      answer = { text: demoTopicCheck(user), delayMs: 1_000 };
    } else if (system === FIRST_NAME_SYSTEM) {
      kind = "topic check";
      answer = { text: demoTopicFirstName(user), delayMs: 900 };
    } else {
      answer = reason({ text: user, prompt: system });
    }
    requests.push({
      kind,
      model: body.model,
      chars: kind === "topic check" ? quotedChars(user) : user.length,
    });
    if (!answer)
      return reply(400, { error: { message: "The demo has no model for this request." } });
    if (answer.delayMs) await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
    const usage = { input_tokens: Math.ceil((system.length + user.length) / 4), output_tokens: 30 };
    if (path.endsWith("/responses")) {
      return reply(200, {
        object: "response",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: answer.text }],
          },
        ],
        usage,
      });
    }
    return reply(200, {
      object: "chat.completion",
      choices: [
        { index: 0, message: { role: "assistant", content: answer.text }, finish_reason: "stop" },
      ],
      usage,
    });
  };
  return { requests: () => requests.map((request) => ({ ...request })) };
}

/**
 * The key check Settings and setup run on a key before saving it
 * (`openAiKeyStatus`, ReasoningService.ts), answered in the page: a key with
 * "bad" in it is rejected, any other is accepted. Nothing reaches OpenAI.
 */
export function installFakeKeyCheck() {
  const pageFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(HOST)) return pageFetch(input, init);
    const auth = String(new Headers(init.headers ?? {}).get("Authorization") ?? "");
    const model = /^\/v1\/models\/(.+)$/.exec(new URL(url).pathname)?.[1];
    if (!model) return reply(404, { error: { message: "The demo answers model checks only." } });
    // OpenAI's own answers: an invalid key, and a restricted key that may not
    // read models (helpers/keyStatus.mjs refuses only the first).
    if (auth.includes("bad")) {
      return reply(401, { error: { message: "Incorrect API key provided.", code: "invalid_api_key" } });
    }
    if (auth.includes("limited")) {
      return reply(401, {
        error: {
          message: "You have insufficient permissions for this operation. Missing scopes: api.model.read.",
          code: null,
        },
      });
    }
    return reply(200, { id: decodeURIComponent(model), object: "model", owned_by: "openai" });
  };
}
