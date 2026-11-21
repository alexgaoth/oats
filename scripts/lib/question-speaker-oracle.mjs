// Evaluation only. No live speaker inference or change to the recording path.
const SILENCE_MS = 8_000;
const HOLD_MS = 30_000;
const RECHECK_MS = 1_000;

/** Count each AMI word once, regardless of how much of it overlaps this final. */
export function speakerVotes(words) {
  const counts = new Map();
  for (const { speaker } of words) {
    counts.set(speaker, (counts.get(speaker) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  return {
    speaker: sorted[0] && sorted[0][1] !== sorted[1]?.[1] ? sorted[0][0] : null,
    mixed: counts.size > 1,
  };
}

export function overlappingWords(words, { start, end }) {
  const overlapping = [];
  for (const word of words) {
    if (word.start >= end) break; // AMI words are in time order.
    if (Math.min(word.end, end) > Math.max(word.start, start)) overlapping.push(word);
  }
  return overlapping;
}

/** Rules b/c. Each question retains its own deadline even if a later question arrives. */
export function replaySpeakerReplies(turns, { skipQuestions, isSpeaking, assess }) {
  const pending = new Map();
  const results = new Map();
  const settle = (question, reply, at) => {
    results.set(question.id, {
      state: assess(reply ? [{ text: reply.text }] : [], question.quote).outcome,
      verdictAt: at,
      replyId: reply?.id ?? null,
    });
    pending.delete(question.id);
  };
  const expire = (time) => {
    for (const entry of pending.values()) {
      while (entry.due <= time) {
        if (entry.due < entry.question.at + HOLD_MS && isSpeaking(entry.due)) {
          entry.due += RECHECK_MS;
        } else {
          settle(entry.question, null, entry.due);
          break;
        }
      }
    }
  };
  for (const turn of turns) {
    expire(turn.at);
    if (turn.speaker && (!skipQuestions || !turn.quote)) {
      for (const { question } of pending.values()) {
        if (question.speaker && question.speaker !== turn.speaker) settle(question, turn, turn.at);
      }
    }
    if (turn.quote) pending.set(turn.id, { question: turn, due: turn.at + SILENCE_MS });
  }
  expire(Infinity);
  return results;
}
