// A tiny question classifier: logistic regression over hashed word n-grams, in
// plain JavaScript, with no dependency and no model file to fetch. `features`
// turns a sentence into bucket numbers, `scoreSentence` adds up their weights.
// Trained by `scripts/question-eval.mjs train`.
//
// The text is read the way recognition gives it: no case, no fillers, no
// immediate repeats. Words at the start of a sentence count apart from the same
// words later on ("is it" opening a sentence is a question; inside one it is
// not), and so do the last words (tags).

export const BITS = 20;
const SIZE = 1 << BITS;

/** FNV-1a, 32 bits: stable across machines, cheap per word. */
function hash(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

const FILLER = /^(?:um+|uh+|mm+|mhm+|hmm+|er+|erm|ah+|eh|mm-hmm|uh-huh|huh)$/;
const LEAD = new Set(
  "so and but or okay ok kay well right yeah yes no oh now then because cause like alright sorry actually anyway also just see look hey wait though".split(
    " "
  )
);

/** Words of a sentence, as the features read them. */
export function wordsOf(text) {
  const words = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const word = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "").replace(/’/g, "'");
    if (!word || FILLER.test(word)) continue;
    if (words.at(-1) === word) continue;
    words.push(word);
  }
  return words;
}

const lengthBucket = (count) =>
  count <= 1
    ? "1"
    : count === 2
      ? "2"
      : count <= 4
        ? "3"
        : count <= 8
          ? "5"
          : count <= 15
            ? "9"
            : "16";

/**
 * The feature names of a sentence. `punctuation: false` leaves out what the
 * sentence's marks say, for the stage that reads words alone.
 */
export function featureNames(text, { punctuation = true } = {}) {
  const words = wordsOf(text);
  const names = [`len:${lengthBucket(words.length)}`];
  let start = 0;
  while (start < words.length - 1 && LEAD.has(words[start])) start += 1;
  const body = words.slice(start);
  if (body[0]) names.push(`^${body[0]}`);
  if (body[1]) names.push(`^${body[0]} ${body[1]}`);
  if (body[2]) names.push(`^${body[0]} ${body[1]} ${body[2]}`);
  const last = words.at(-1);
  if (last) names.push(`$${last}`);
  if (words.length > 1) names.push(`$${words.at(-2)} ${last}`);
  if (words.length > 2) names.push(`$${words.at(-3)} ${words.at(-2)} ${last}`);
  for (let index = 0; index < words.length; index += 1) {
    names.push(`w:${words[index]}`);
    if (index + 1 < words.length) names.push(`b:${words[index]} ${words[index + 1]}`);
  }
  if (punctuation) {
    if (text.includes("?")) names.push("mark:?");
    if (/[.!]\s*$/.test(text)) names.push("mark:.");
  }
  return names;
}

export function features(text, options) {
  return featureNames(text, options).map((name) => hash(name) % SIZE);
}

const sigmoid = (value) => 1 / (1 + Math.exp(-value));

/**
 * The model as it is kept: bucket numbers and weights. `weights` for quick
 * reading is built from them once.
 */
export function modelFrom({ bias, entries, ...rest }) {
  const weights = new Float32Array(SIZE);
  for (const [bucket, weight] of entries) weights[bucket] = weight;
  return { ...rest, bias, weights, entries };
}

/** The raw score of a sentence: above 0 is more likely than not. */
export function scoreSentence(model, text, options) {
  let total = model.bias;
  for (const index of features(text, options)) total += model.weights[index];
  return total;
}

/** The score as a probability. */
export const probability = sigmoid;

/**
 * Logistic regression by FTRL-proximal (McMahan et al., 2013): per-coordinate
 * rates, and L1 that sets most weights to exactly 0. `examples` are `{ features,
 * y }`. Deterministic from `seed`: the same examples give the same weights.
 */
export function train(examples, { alpha = 0.2, beta = 1, l1 = 1, l2 = 10, epochs = 6, seed = 1 } = {}) {
  const z = new Float64Array(SIZE + 1);
  const n = new Float64Array(SIZE + 1);
  const weightAt = (index) => {
    const value = z[index];
    if (Math.abs(value) <= l1) return 0;
    return -(value - Math.sign(value) * l1) / ((beta + Math.sqrt(n[index])) / alpha + l2);
  };
  let state = seed >>> 0;
  const draw = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const order = examples.map((_, index) => index);
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (let index = order.length - 1; index > 0; index -= 1) {
      const pick = Math.floor(draw() * (index + 1));
      [order[index], order[pick]] = [order[pick], order[index]];
    }
    for (const at of order) {
      const example = examples[at];
      const active = [SIZE, ...example.features];
      const weights = active.map(weightAt);
      const gradient = sigmoid(weights.reduce((sum, weight) => sum + weight, 0)) - example.y;
      const square = gradient * gradient;
      active.forEach((index, k) => {
        const sigma = (Math.sqrt(n[index] + square) - Math.sqrt(n[index])) / alpha;
        z[index] += gradient - sigma * weights[k];
        n[index] += square;
      });
    }
  }
  const entries = [];
  for (let index = 0; index < SIZE; index += 1) {
    const weight = weightAt(index);
    if (weight !== 0) entries.push([index, Number(weight.toFixed(3))]);
  }
  return modelFrom({ bias: Number(weightAt(SIZE).toFixed(3)), entries });
}

// Words after which a new clause can start, when punctuation does not say so.
const OPENERS = new Set(
  "so and but or yeah yes no okay ok well right because cause then um uh mm hmm now oh actually like alright".split(
    " "
  )
);
/** How many words of a clause the model reads: a question shows early. */
const CLAUSE_WORDS = 16;

/**
 * What may be the question in a turn: each sentence whole, and each clause that
 * opens inside one. `read` is what the model scores, `quote` what a card shows:
 * a clause to the end of its sentence.
 */
export function candidatesOf(text) {
  const out = [];
  for (const sentence of sentencesOf(text)) {
    const asked = sentence.includes("?");
    out.push({ read: sentence, quote: sentence, asked });
    const words = sentence.split(" ");
    for (let at = 1; at < words.length; at += 1) {
      const previous = words[at - 1];
      const bare = previous.toLowerCase().replace(/[^a-z']/g, "");
      if (!/[,;:]$/.test(previous) && !OPENERS.has(bare)) continue;
      out.push({
        read: words.slice(at, at + CLAUSE_WORDS).join(" "),
        quote: words.slice(at).join(" "),
        asked,
      });
    }
  }
  return out;
}

/**
 * The turn's best candidate, `{ score, quote }`, or null for an empty turn.
 * `mark` is what a recognizer's "?" adds: the model reads words only, and how far
 * to trust that "?" depends on the recognizer, so it is set apart from training.
 */
export function bestCandidate(model, text, { mark = 3 } = {}) {
  let top = null;
  for (const candidate of candidatesOf(text)) {
    const score =
      scoreSentence(model, candidate.read, { punctuation: false }) + (candidate.asked ? mark : 0);
    if (!top || score > top.score) top = { score, quote: candidate.quote };
  }
  return top;
}

/** Sentence ends, the way recognition marks them. */
export function sentencesOf(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}
