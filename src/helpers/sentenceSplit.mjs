const END_MARK = /[.!?…。．！？｡]/u;
const SPACE = /\s/u;
const CLOSER = /["'’”»›）)\]】」』》〉]/u;
const OPENER = /["'‘“«‹（(\[【「『《〈¿¡]/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
const UPPER_OR_NUMBER = /[\p{Lu}\p{N}]/u;
// These are known Latin and Cyrillic abbreviations, not arbitrary Unicode words.
const ABBREVIATION =
  /(?:^|[^a-z0-9а-яё.])(?:mr|mrs|ms|dr|prof|sr|sra|srta|st|ste|mme|mlle|m|herr|fr|dott|sig|dra|г|им|тов|ул|p\.\s?ej|z\.\s?b|d\.\s?h|u\.\s?a|dott\.ssa)$/iu;
const SOFT_ABBREVIATION =
  /(?:^|[^a-z0-9а-яё.])(?:e\.g|i\.e|a\.m|p\.m|etc|bzw|ex|p\.ex|par\.ex|т\.е|т\.д|т\.п)$/iu;
const ABBREVIATION_TAIL = /^\s+(?:ej|ex|[bheaдпе])\./iu;
const DOTTED_INITIALISM = /(?:^|[^a-zA-Z0-9.])(?:[A-Z]\.\s?)+[A-Z]$/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function periodInside(text, at) {
  const next = text[at + 1];
  if (/[0-9０-９]/u.test(text[at - 1] ?? "") && /[0-9０-９]/u.test(next ?? "")) return true;
  if (
    next &&
    (/[a-z0-9]/.test(next) ||
      (next.charCodeAt(0) > 127 && LETTER_OR_NUMBER.test(next) && !CJK.test(next)))
  ) {
    // Dotted abbreviations and domains have no space.
    return true;
  }
  const before = text.slice(Math.max(0, at - 24), at);
  if (ABBREVIATION.test(before)) return true;
  let after = at + 1;
  while (after < text.length && SPACE.test(text[after])) after += 1;
  if (/(?:^|\s)[pdzuт]$/iu.test(before) && ABBREVIATION_TAIL.test(text.slice(at + 1, at + 12))) {
    return true;
  }
  if (SOFT_ABBREVIATION.test(before)) return !UPPER_OR_NUMBER.test(text[after] ?? "");
  if (DOTTED_INITIALISM.test(before) && /\p{Ll}/u.test(text[after] ?? "")) return true;
  // Initials in names and the internal periods of spaced initialisms.
  return (
    /(?:^|[^a-zA-Z0-9А-Яа-яЁё.])[A-ZА-ЯЁ]$/u.test(before) && UPPER_OR_NUMBER.test(text[after] ?? "")
  );
}

/**
 * Nonempty slices of one finalized segment. Offsets are UTF-16, end exclusive.
 * Keep the marks and closing quotes, but not whitespace between sentences.
 */
export function splitSentences(text) {
  const sentences = [];
  let start = 0;
  const push = (end) => {
    while (start < end && SPACE.test(text[start])) start += 1;
    while (end > start && SPACE.test(text[end - 1])) end -= 1;
    if (end > start) sentences.push({ start, end, text: text.slice(start, end) });
  };
  for (let i = 0; i < text.length; i += 1) {
    if (!END_MARK.test(text[i])) continue;
    if ((text[i] === "." || text[i] === "．") && periodInside(text, i)) continue;
    let end = i + 1;
    while (end < text.length && END_MARK.test(text[end])) end += 1;
    while (end < text.length && CLOSER.test(text[end])) {
      // The same straight quote can open the next sentence without a space.
      if (OPENER.test(text[end]) && LETTER_OR_NUMBER.test(text[end + 1] ?? "")) break;
      end += 1;
    }
    push(end);
    start = end;
    i = end - 1;
  }
  push(text.length);
  return sentences;
}

/**
 * Make records without moving transcript or event IDs. Times are estimates in
 * milliseconds from the beginning of this sitting, like segment audio times.
 * When the final has only an arrival time, it supplies the end and text length
 * supplies a duration estimate. No sentence carries over to the next final.
 */
export function makeSentenceRecords(segment, receivedOffsetMs = 0) {
  const parts = splitSentences(segment.text);
  const textStart = parts[0]?.start ?? 0;
  const textEnd = parts.at(-1)?.end ?? 0;
  const hasSpan = Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs);
  const start = hasSpan
    ? Math.max(0, segment.startMs)
    : Math.max(0, receivedOffsetMs - (textEnd - textStart) * 70);
  const end = Math.max(start, hasSpan ? segment.endMs : receivedOffsetMs);
  const at = (offset) =>
    Math.round(start + ((offset - textStart) / (textEnd - textStart)) * (end - start));
  return parts.map((part, index) => ({
    ...part,
    id: `${segment.id}.${index + 1}`,
    segmentId: segment.id,
    startMs: at(part.start),
    endMs: at(part.end),
    source: segment.source,
    question: null,
    answered: null,
    topic: null,
    link: null,
  }));
}
