// The English strings the live figures use: the parts of the app's own
// translation they need, so the page carries a few kilobytes of words, not the
// app's whole English. Each entry is a key and everything under it (its
// plurals too). test/helpers/site.test.js checks that every key the figures'
// components name is here.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENGLISH = "src/locales/en/translation.json";

/** The files these strings come from, for the bundle's hash (sources.mjs). */
export const LIVE_STRINGS_FILES = ["site/live-strings.mjs", ENGLISH];

export const LIVE_STRINGS = [
  "demo",
  "oats.flow",
  "oats.review",
  "oats.conversation.legend",
  "oats.conversation.contourSummary",
  "oats.conversation.contourEmpty",
  "oats.intelligence.talkTime",
  "oats.intelligence.speakerN",
  "oats.intelligence.speakerRoom",
  "oats.intelligence.speakerYou",
  "oats.intelligence.nameSpeaker",
  "oats.intelligence.noTranscript",
  "questionCard",
  "topicGraph.search",
];

/** Whether `key` (a dotted path) is one of LIVE_STRINGS or under one. */
export function isLiveString(key) {
  return LIVE_STRINGS.some(
    (entry) => key === entry || key.startsWith(`${entry}.`) || key.startsWith(`${entry}_`)
  );
}

/** The English translation cut to LIVE_STRINGS, nested as it is. */
export function liveStrings() {
  const english = JSON.parse(fs.readFileSync(path.join(root, ENGLISH), "utf8"));
  const out = {};
  const walk = (node, prefix, target) => {
    for (const [key, value] of Object.entries(node)) {
      const at = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") {
        const kept = {};
        walk(value, at, kept);
        if (Object.keys(kept).length) target[key] = kept;
      } else if (isLiveString(at)) {
        target[key] = value;
      }
    }
  };
  walk(english, "", out);
  return out;
}
