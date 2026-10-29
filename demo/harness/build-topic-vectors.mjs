#!/usr/bin/env node
// Writes the topic vectors the harness answers `embed-texts` with
// (`topicVectors.json`, read by `fake-main.mjs`), so the Global conversations
// board links the samples by meaning as the app does. The browser cannot run
// the app's all-MiniLM-L6-v2, so the vectors are made here, once, by the same
// model through onnxruntime-node (`scripts/lib/minilm.mjs`).
//
//   node demo/harness/build-topic-vectors.mjs
//
// The texts are every topic name of the samples (the on-device names in the
// fixtures, and the names `topicNames.mjs` gives the review's topics when it
// is recorded live). A text not in the table gets a zero vector in the
// harness, which links to nothing. Stored as int8 in base64: the cosines move
// by less than 0.01.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEmbedder } from "../../scripts/lib/minilm.mjs";
import { topicLinkText } from "../../src/helpers/conversationLinks.mjs";
import { DEMO_TOPIC_NAMES } from "./topicNames.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

function snapshotOf(fixture) {
  const note = fixture.note ?? fixture;
  const topics = note.conversation_topics;
  if (!topics) return null;
  return typeof topics === "string" ? JSON.parse(topics) : topics;
}

const fixtures = [
  path.join(root, "src/helpers/sampleConversations/launch-readiness-review.json"),
  ...fs
    .readdirSync(path.join(root, "demo/fixtures"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(root, "demo/fixtures", name)),
];

const texts = new Set(DEMO_TOPIC_NAMES);
for (const file of fixtures) {
  for (const node of snapshotOf(JSON.parse(fs.readFileSync(file, "utf8")))?.nodes ?? []) {
    const text = topicLinkText(node);
    if (text) texts.add(text);
  }
}

const embedder = await createEmbedder({
  cacheDir: path.join(os.homedir(), ".cache", "oats", "demo-topic-vectors"),
});
const list = [...texts].sort();
const vectors = await embedder.embed(list);
const table = {};
list.forEach((text, index) => {
  const bytes = Int8Array.from(vectors[index], (value) =>
    Math.max(-127, Math.min(127, Math.round(value * 127)))
  );
  table[text] = Buffer.from(bytes.buffer).toString("base64");
});
const out = path.join(here, "topicVectors.json");
fs.writeFileSync(out, `${JSON.stringify(table, null, 1)}\n`);
console.log(`${list.length} texts -> ${path.relative(root, out)}`);
