# Question spotting: the benchmark

How well Oats spots a question in a room, quotes it, and reads what came back,
measured on the AMI meeting corpus. The script is `scripts/question-eval.mjs`;
the gold and the scores are `scripts/lib/question-truth.mjs`. Nobody had measured
this before. The site says "Every question, caught as it's asked".

This section was written and committed before any branch ran. Results are below
it.

## Method

### The path that is measured

`src/helpers/conversationAide.mjs`, the real functions, imported as they are:
`isQuestionCandidate` decides a card, `extractQuestionSentence` picks its quote,
and the real `ConversationAideSession` on a virtual clock, with no classifier,
gives each card its outcome and opens its searches. Detection is per finalized
turn, as in the app.

### The corpus and the split

The AMI meeting corpus, manual annotations 1.6.2 (CC BY 4.0). 139 meetings have
dialogue acts and adjacency pairs.

| Part  | Meetings | Hours | Use                                                                                                                                                |
| ----- | -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| test  | 12       | 6.4   | ES2004, IS1009, TS3003, all four of each: the test half of the 24 meetings the topic evals use. Scored only after a method is frozen. Never read. |
| tune  | 11       | 5.5   | The tuning half of those 24. Its twelfth, IB4010, has no dialogue acts. For reading errors, choosing rules and thresholds.                         |
| train | 116      | 59.7  | Everything else. For fitting classifiers, and for reading errors when tune runs out.                                                               |

Real recognition exists for the 8 test meetings with a far-field recording
(ES2004a-d, IS1009a-b, TS3003a-b). They are the real-recognition test.

### What counts as a question

Fixed from the type glosses and a sample of each type in training meetings,
before any detector was scored.

- **Strict** (the primary set): `el.inf` (asks for information), `el.sug` (asks
  for a suggestion) and `el.ass` (asks for an opinion), with at least 3 words
  that are not fillers. A card that says "Right?" or "One," says nothing.
  `el.und` is out: 2 in 3 are under three words, and most are "okay?", "right?",
  "you know".
- **Broad**: all four elicit types, any length.

Three facts about this gold, from the training meetings: 30% of elicit acts have
no question mark in the manual text (some are statements that ask, some are
transcribers' choices), about 1,500 acts of other types have one, and a sampled
reading of the types shows statements filed as `el.ass`. So the gold holds noise.
"Checking the gold" below measures how much.

### The views

Each detector reads each view. Turns are the app's unit: a room is one stream,
every voice in time order.

- **(a) manual**: the manual words and punctuation, cut at pauses of 400 ms or at
  20 s, as `amiReference` cuts a room. Flatters the app: recognition does not
  reproduce this punctuation. A classic ICSI result is that question accuracy on
  meeting text falls sharply when punctuation goes.
- **(b) plain**: the same turns with no punctuation, in lower case but for "I",
  acronyms and the first letter.
- **(c) recognition**: `~/oats-asr-cache/replays/<model>__<room>/<meeting>.json`,
  the app's real segmenter and Whisper over the far-field recording. Each segment's
  words are aligned to the manual words inside its time span, so a word of a
  quote maps to a word of a gold question.

### The scores

- **A card is right** when its quote and a gold question share at least half of
  the shorter of the two (the overlap coefficient, 0.5). So a long quote that holds
  a short question counts, and half of a question cut over two turns counts. **A
  question is caught** when a card holds it.
- **Precision** is right cards over all cards. **Recall** is caught questions
  over all questions. **F1** is their harmonic mean. All three pool the counts over
  meetings, and each has a 95% bootstrap interval from 2,000 resamples of meetings.
  A difference has a paired interval.
- A second line scores **the whole turn** in place of the quote: what detection
  alone could reach with a perfect quote.
- **Delay**: from the end of the question to its first card. In views (a) and (b)
  a card arrives 500 ms after the last word of its turn (`FINAL_DELAY_MS`). In view
  (c), when the segment closed plus the time Whisper took on it.
- **The quote**: per right card, the word F1 of quote and question, and how often
  it reads whole: it holds at least 80% of the question, and at least 60% of it is
  the question.
- **Outcomes**: the session's final state against the adjacency pairs. Gold
  `answered`: a pair of type POS, NEG, PART or ELA. Gold `unknown`: UNC only.
  Gold `open`: no pair. A proxy: see "Outcomes".
- **Searches**: how many search tabs open by themselves per hour, and how many of
  them follow a real "I don't know".
- **Recognition misses**: in view (c), a question with under half of its words in
  any recognized text is a recognition miss, not a detector miss. Both are
  reported.

### The bars

Written after the baseline on views (a) and (b) and before any branch.

The default bar for an on-device change, on real recognition in both rooms
(quiet room, steady sound), strict set:

1. F1 gain of at least 0.05, with a 95% interval that excludes 0.
2. Precision at or above the baseline.
3. No added delay to the first card (median and 90th percentile).

Baseline precision is so low that this bar alone is weak, so a change that ships
must also meet:

4. Recall at or above the baseline. A question missed costs more than a false
   card.
5. Searches that open by themselves on a reply that is not "I don't know": no
   more per hour than the baseline. A yes/no question caught is a question whose
   "No." can open a browser.
6. Under 1 ms a turn and 1 MB, no key, no download, no model round trip.
7. Every test in `test/helpers/conversationAide.test.js` still passes, with the
   other nine locales unchanged.

A model that refines cards after they appear (local or cloud) is reported apart
and must beat the best on-device detector by at least 0.05 F1 with an interval that
excludes 0. It never delays a first card, and when it fails the card keeps its
local verdict (rule 4 in CLAUDE.md).

A method is frozen on tune and train, then scored once on test.
