// all-MiniLM-L6-v2 in Node, for the benchmarks: tokenized, mean-pooled and made
// unit length as the app's ONNX worker does it (`src/workers/onnxWorker.js`),
// through onnxruntime-node. Local only.
//
// Every vector is cached on disk by the SHA-1 of its text. The topic benchmark's
// cache (`~/.cache/oats/topic-eval/vectors`, not unit length) is read too, so a
// text either benchmark embedded is not embedded again; new vectors are written
// to `cacheDir` only.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARED_CACHE = path.join(os.homedir(), ".cache", "oats", "topic-eval", "vectors");
const MAX_TOKENS = 256;

function unit(vector) {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  const out = new Float32Array(vector.length);
  if (norm > 0)
    for (let index = 0; index < vector.length; index += 1) out[index] = vector[index] / norm;
  return out;
}

/**
 * @param {{ cacheDir: string, modelDir?: string, threads?: number }} options
 * @returns {Promise<{ embed: (texts: string[]) => Promise<Float32Array[]>, computed: () => number }>}
 */
export async function createEmbedder({ cacheDir, modelDir, threads = 2 }) {
  const require = createRequire(path.join(ROOT, "package.json"));
  const ort = require("onnxruntime-node");
  const candidates = [
    modelDir,
    path.join(ROOT, "resources", "bin", "all-MiniLM-L6-v2"),
    path.join(os.homedir(), ".cache", "oats", "embedding-models", "all-MiniLM-L6-v2"),
  ].filter(Boolean);
  const dir = candidates.find((candidate) => fs.existsSync(path.join(candidate, "model.onnx")));
  if (!dir) throw new Error("all-MiniLM-L6-v2 not found: run node scripts/download-minilm.js");
  const vocab = new Map(
    Object.entries(
      JSON.parse(fs.readFileSync(path.join(dir, "tokenizer.json"), "utf8")).model.vocab
    )
  );
  const session = await ort.InferenceSession.create(path.join(dir, "model.onnx"), {
    intraOpNumThreads: threads,
    executionMode: "sequential",
  });
  const tokenize = (text) => {
    const ids = [vocab.get("[CLS]") ?? 101];
    for (const word of text.toLowerCase().match(/[a-z0-9]+|[^\s\w]/g) || []) {
      if (ids.length >= MAX_TOKENS - 1) break;
      if (vocab.has(word)) {
        ids.push(vocab.get(word));
        continue;
      }
      let start = 0;
      while (start < word.length && ids.length < MAX_TOKENS - 1) {
        let end = word.length;
        let piece = null;
        while (end > start) {
          const candidate = start === 0 ? word.slice(start, end) : `##${word.slice(start, end)}`;
          if (vocab.has(candidate)) {
            piece = vocab.get(candidate);
            break;
          }
          end -= 1;
        }
        if (piece == null) {
          ids.push(vocab.get("[UNK]") ?? 100);
          start += 1;
        } else {
          ids.push(piece);
          start = end;
        }
      }
    }
    ids.push(vocab.get("[SEP]") ?? 102);
    return ids;
  };
  const embedOne = async (text) => {
    const ids = tokenize(text);
    const n = ids.length;
    const out = await session.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, n]),
      attention_mask: new ort.Tensor("int64", new BigInt64Array(n).fill(1n), [1, n]),
      token_type_ids: new ort.Tensor("int64", new BigInt64Array(n), [1, n]),
    });
    const data = (out.last_hidden_state ?? out.output_0).data;
    const dimension = data.length / n;
    const vector = new Float32Array(dimension);
    for (let token = 0; token < n; token += 1) {
      for (let index = 0; index < dimension; index += 1) {
        vector[index] += data[token * dimension + index] / n;
      }
    }
    return unit(vector);
  };
  const read = (file) => {
    const buffer = fs.readFileSync(file);
    return unit(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
  };
  fs.mkdirSync(cacheDir, { recursive: true });
  let computed = 0;
  return {
    async embed(texts) {
      const vectors = [];
      for (const text of texts) {
        const name = `${crypto.createHash("sha1").update(text).digest("hex")}.bin`;
        const own = path.join(cacheDir, name);
        const shared = path.join(SHARED_CACHE, name);
        if (fs.existsSync(own)) {
          vectors.push(read(own));
          continue;
        }
        if (fs.existsSync(shared)) {
          vectors.push(read(shared));
          continue;
        }
        const vector = await embedOne(text);
        computed += 1;
        fs.writeFileSync(own, Buffer.from(vector.buffer));
        vectors.push(vector);
      }
      return vectors;
    },
    computed: () => computed,
  };
}

/** Cosine of two unit vectors. */
export function dot(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index] * b[index];
  return total;
}
