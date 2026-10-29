// Scores of a summary that need no judge: ROUGE-L against the annotators' text,
// and the lines that give an item to "You" or "Them" (labels a room's
// transcript does not have at Finish). Pure: test/helpers/summaryEval.test.js.

export function tokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** ROUGE-L F1 (LCS over words, lowercased, punctuation dropped). */
export function rougeL(candidate, reference) {
  const a = tokens(candidate);
  const b = tokens(reference);
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let row = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    [prev, row] = [row, prev];
  }
  const lcs = prev[b.length];
  const p = lcs / a.length;
  const r = lcs / b.length;
  return p + r ? (2 * p * r) / (p + r) : 0;
}

/** Lines that give an item to "You" or "Them": the prompt's labels, which a room's transcript does not have. */
export function youThemLines(text) {
  const pattern =
    /(\*\*(You|Them)\*\*|\b(You|Them)\s*:|\((You|Them)\)|\[(You|Them)\]|^\s*[-*]\s*(\[[ xX]\]\s*)?(You|Them)\b|[—–-]\s*(You|Them)\s*$)/;
  return String(text ?? "")
    .split("\n")
    .filter((line) => pattern.test(line)).length;
}
