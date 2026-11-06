// When a room came back to a subject inside one meeting: the ground truth for
// the return benchmark (`scripts/return-eval.mjs`), from AMI's human topic
// annotations (manual annotations 1.6.2, CC BY 4.0).
//
// AMI marks one topic per stretch of words, in a tree: a top-level topic and
// sub-topics inside it. Every element is its own stretch, so a subject that
// comes back is a second element with the same label. Labels go through the
// link benchmark's `subjectOf`: its spellings are joined and its generic labels
// (opening, chitchat, a presentation by whoever) never make a subject.
//
// Two levels, each its own gold:
//
//   top   Only the top-level topic of each turn. This is the gold the brief
//         names. It is sparse, because AMI's top level is often "discussion"
//         or "marketing expert presentation", with the subject one level down.
//   fine  The turn's innermost topic and every topic above it. "Look and
//         usability" in a presentation and again in the discussion comes back
//         here, and not at the top level.
//
// A subject is **held** while the room is on it. Held stretches closer than
// `minGap` words are one stretch: a passing remark is not leaving. A stretch of
// fewer than `minWords` words does not count. A subject **returns** at the
// start of each held stretch after its first.

import { mostCommon } from "./topic-corpus.mjs";
import { rawLabel, subjectOf } from "./link-truth.mjs";

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/** The subjects a turn is on at one level. */
function subjectsAt(utterance, topics, level) {
  const out = new Set();
  const start =
    level === "top"
      ? topics.get(mostCommon(utterance.refTop ?? []))
      : topics.get(mostCommon(utterance.refFine ?? []));
  for (let topic = start; topic; topic = level === "top" ? null : topic.parent) {
    const subject = subjectOf(rawLabel(topic));
    if (subject) out.add(subject);
  }
  return out;
}

/**
 * The subjects held in a meeting and each return to one.
 *
 * @param {{ utterances: any[], topics: Map<string, any> }} conversation
 * @param {{ level?: "top" | "fine", minWords?: number, minGap?: number }} [options]
 * @returns {{ words: number, held: Array<{ subject: string, from: number, to: number,
 *     start: number, end: number, words: number }>,
 *   returns: Array<{ subject: string, from: number, to: number, start: number, end: number,
 *     words: number, previous: { from: number, to: number, start: number, end: number, words: number } }>,
 *   subjectsOf: (index: number) => Set<string> }}
 */
export function meetingReturns(conversation, { level = "top", minWords = 100, minGap = 100 } = {}) {
  const { utterances, topics } = conversation;
  const perTurn = utterances.map((utterance) => subjectsAt(utterance, topics, level));
  const wordsIn = utterances.map((utterance) => wordCount(utterance.text));
  const position = [0];
  for (const count of wordsIn) position.push(position.at(-1) + count);
  const all = new Set(perTurn.flatMap((subjects) => [...subjects]));
  const held = [];
  const returns = [];
  for (const subject of all) {
    const stretches = [];
    perTurn.forEach((subjects, index) => {
      if (!subjects.has(subject)) return;
      const last = stretches.at(-1);
      if (last && position[index] - position[last.to + 1] < minGap) {
        last.to = index;
      } else {
        stretches.push({ subject, from: index, to: index });
      }
    });
    const kept = [];
    for (const stretch of stretches) {
      let words = 0;
      for (let index = stretch.from; index <= stretch.to; index += 1) {
        if (perTurn[index].has(subject)) words += wordsIn[index];
      }
      if (words < minWords) continue;
      kept.push({
        ...stretch,
        words,
        start: utterances[stretch.from].start,
        end: utterances[stretch.to].end,
      });
    }
    held.push(...kept);
    for (let index = 1; index < kept.length; index += 1) {
      returns.push({ ...kept[index], previous: kept[index - 1] });
    }
  }
  held.sort((a, b) => a.start - b.start);
  returns.sort((a, b) => a.start - b.start);
  return {
    words: position.at(-1),
    held,
    returns,
    subjectsOf: (index) => perTurn[index] ?? new Set(),
  };
}
