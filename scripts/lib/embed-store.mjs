// Vectors written by `embed_texts.py`: one store per model configuration, read
// whole into memory. `dims` keeps the first dimensions of each vector and makes
// it unit length again (Matryoshka truncation).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const keyOf = (text) => crypto.createHash("sha1").update(text).digest("hex");

/**
 * @param {string} root the `--store` directory
 * @param {string} config
 * @param {{ dims?: number }} [options]
 * @returns {{ has: (text: string) => boolean, get: (text: string) => Float32Array | null,
 *   dimension: number, size: number }}
 */
export function readStore(root, config, { dims } = {}) {
  const folder = path.join(root, config);
  const keys = fs
    .readFileSync(path.join(folder, "keys.txt"), "utf8")
    .split("\n")
    .filter(Boolean);
  const bytes = fs.readFileSync(path.join(folder, "vectors.f32"));
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const dimension = all.length / keys.length;
  if (!Number.isInteger(dimension)) throw new Error(`${config}: vectors and keys disagree`);
  const index = new Map(keys.map((key, at) => [key, at]));
  const kept = dims ?? dimension;
  const get = (text) => {
    const at = index.get(keyOf(text));
    if (at == null) return null;
    const vector = all.slice(at * dimension, at * dimension + kept);
    if (kept === dimension) return vector;
    let norm = 0;
    for (const value of vector) norm += value * value;
    norm = Math.sqrt(norm);
    for (let i = 0; i < kept; i += 1) vector[i] /= norm;
    return vector;
  };
  return { has: (text) => index.has(keyOf(text)), get, dimension: kept, size: keys.length };
}
