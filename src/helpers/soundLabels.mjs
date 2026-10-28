// What Whisper writes for a sound instead of words.
//
// base.en and small.en answer a far voice they cannot make out, a door, a
// laugh or music with a label in brackets: "[inaudible]", "(muffled
// speaking)", "(door closes)", "[MUSIC PLAYING]", "*sigh*", or words between
// music notes. Replayed through a room with steady sound (the AMI meetings,
// scripts/room-replay.js), small.en wrote 199 segments that were only such a
// label in four hours, about one a minute, and the app showed each as a line
// somebody said (docs/dictation-accuracy.md).
//
// A segment whose text is only labels is dropped; a label among words stays,
// with the words.
//
// Pure, dependency-free ESM.

// A label: [..], (..), *..*, or words between music notes.
const LABEL = /\[[^\]]*\]|\([^)]*\)|\*[^*\n]*\*|♪[^♪]*♪/gu;
// What is left of a line of labels: speaker-change marks, dashes, notes, punctuation.
const NOT_WORDS = />>|[-–—♪.,!?…:;"'\s]/gu;

/** True when `text` has something in it and all of it is sound labels. */
export function isOnlySoundLabels(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  const rest = trimmed.replace(LABEL, " ").replace(NOT_WORDS, "");
  return !/[\p{L}\p{N}]/u.test(rest);
}
