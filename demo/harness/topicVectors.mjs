// The harness's answer to `embed-texts`: the vectors `build-topic-vectors.mjs`
// made for the samples' topic names with the app's own all-MiniLM-L6-v2, so
// the Global conversations board links them by meaning as the app does. A
// text not in the table gets a zero vector, which is alike nothing.

import table from "./topicVectors.json" with { type: "json" };

const DIMENSION = 384;
const decoded = new Map();

/** The unit vector of one topic text, as an array (what IPC carries). */
export function demoTopicVector(text) {
  const key = String(text ?? "");
  if (decoded.has(key)) return decoded.get(key);
  const base64 = table[key];
  let vector = new Array(DIMENSION).fill(0);
  if (base64) {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const values = Array.from(new Int8Array(bytes.buffer), (value) => value / 127);
    const norm = Math.hypot(...values) || 1;
    vector = values.map((value) => value / norm);
  }
  decoded.set(key, vector);
  return vector;
}
