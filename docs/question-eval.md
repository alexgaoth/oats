# Question spotting: the benchmark

How well Oats spots a question in a room, quotes it, and reads what came back,
measured on the AMI meeting corpus. The script is `scripts/question-eval.mjs`;
the gold and the scores are `scripts/lib/question-truth.mjs`. Nobody had measured
this before. The site says "Every question, caught as it's asked".

## In brief

- **The app, measured.** On real recognition in a quiet room (small.en, 8 AMI test
  meetings, 4 hours), 3 in 4 cards were false, about 99 an hour, and 48% of the
  questions got a card. In steady sound, 85 false cards an hour and 22% of the
  questions. A detector that trusts only recognition's "?" scored higher than the
  app (F1 0.459 against 0.325).
- **Why.** `QUESTION_ANYWHERE`: 9 in 10 false cards were statements with "what",
  "how" or "which" in them. And the prefixes held only wh-words, so half of the
  misses were plain yes/no questions that recognition wrote without a "?".
- **The ceiling is recognition.** small.en keeps 68% of the questions in a quiet
  room and 29% in steady sound. A question that is not in the text cannot get a
  card. Parakeet Ultra keeps 80% and 45%, and writes the best "?" of the engines
  measured.
- **The fix is rules, on device, with no weights** (`alex/question-rules`). English
  questions are found where they open a clause. False cards fall from 99 to 34 an
  hour, F1 rises by 0.150 [0.108, 0.181] in a quiet room and by 0.089 [0.054,
  0.118] in steady sound, recall does not fall, and the first card is no later.
  It clears the default bar in all eight rooms, on four engines.
- **Replies** (`alex/question-replies`). The outcome is right 84% of the time, up
  from 75%. Answered questions left as silence fall from 18% to 3%. Searches that
  opened on a reply that did not say "I don't know" fall from 2 to 0 in 4 hours.
- **What did not earn its place.** A tiny classifier (2,571 weights) adds 0.022
  more F1 than the rules on small.en in a quiet room, with an interval that holds 0,
  at lower recall, and it fails without punctuation. MiniLM, pitch and context lost. A cloud model refining
  cards adds 0.041 in a quiet room and 0.008 in steady sound, under the 0.05 bar.
- **The site's claim does not hold.** "Every question, caught as it's asked": the
  best on-device result here catches 48% to 60% in a quiet room, by engine. See "The
  site".

## Method

This section was written and committed before any branch ran. Results are below
it.

### The path that is measured

`src/helpers/conversationAide.mjs`, the real functions, imported as they are:
`isQuestionCandidate` decides a card, `extractQuestionSentence` picks its quote,
and the real `ConversationAideSession` on a virtual clock, with no classifier,
gives each card its outcome and opens its searches. Detection is per finalized
turn, as in the app.

### The corpus and the split

The AMI meeting corpus, manual annotations 1.6.2 (CC BY 4.0). 139 meetings have
dialogue acts and adjacency pairs.

| Part  | Meetings | Hours | Use                                                                                                                                               |
| ----- | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| test  | 12       | 6.4   | ES2004, IS1009, TS3003, all four of each: the test half of the 24 meetings the topic evals use. Scored only after a method is frozen. Never read. |
| tune  | 11       | 5.5   | The tuning half of those 24. Its twelfth, IB4010, has no dialogue acts. For reading errors, choosing rules and thresholds.                        |
| train | 116      | 59.7  | Everything else. For fitting classifiers, and for reading errors when tune runs out.                                                              |

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

Two additions came after this section was first committed, and neither touches
test meetings. **Tuning recognition**: all 8 meetings with audio are test meetings,
so nothing could be tuned on real recognition without reading test. The 11 tuning
meetings' Array1-01 audio (600 MB, the AMI mirror, CC BY 4.0) went through
`room-replay.js` with track S's settings, in both rooms. **A view for tuning**,
`unasked`: the manual text with every "?" turned into ".". Sentence ends stay, so a
detector has to find a question by its words alone. It is a stand-in used before
recognition arrived, and no result below rests on it.

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

## Checking the gold

Read by hand before any branch ran: 393 errors from tuning meetings, each sorted
into one class. The list is `docs/question-eval-audit.tsv`.

| What was read                               | Items | Sorted                                                                                                                                                                                            |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| False cards, app, plain view                | 149   | 134 plain statements (90%), 5 real questions the gold lacks (3%), 6 fragments, 2 rhetorical, 1 tag, 1 backchannel                                                                                 |
| Missed questions, app, plain view           | 155   | 82 real misses with question words (53%), 19 real misses in statement form that need intonation (12%), 7 tags, 26 fragments, 20 statements the annotators filed as questions (13%), 1 backchannel |
| Cards on a manual "?" that the gold rejects | 89    | 18 real questions filed as another type (20%), 18 tags and checks, 12 echoes and backchannels, 33 fragments, 5 statements, 3 rhetorical                                                           |

What this says:

- **Precision is low for real.** 9 in 10 false cards hold no question. Nearly all
  are a statement with "what", "how", "which" or "when" inside it ("that's what
  I think", "when you press the button"), caught by `QUESTION_ANYWHERE`.
- **Recall loses a clear class.** Half of the misses are questions that open with
  an auxiliary or "any" ("Is that alright", "Does anybody know", "any more ideas"),
  which the prefixes do not list. They need a "?" from recognition.
- **The gold's noise is modest, and known.** If every real question the gold lacks
  counted as right, plain precision would rise from 0.26 to about 0.28. If
  annotators' statements and fragments left the gold, plain recall would rise from
  0.55 to about 0.64. So noise costs about 0.03 of precision and 0.09 of recall,
  and it costs every method the same.
- **The types hide a real class.** "Would you like to go next?" and "Can I do my
  thing?" are `sug` and `off`: they ask, and the gold does not count them. A
  person would not mind those cards. Precision against the gold is a lower bound.

### How far to trust adjacency pairs

Read by hand on tuning meetings: 60 questions the pairs call `open`, 40 they call
`answered`, and all 9 they call `unknown`, each with the 12 s that followed.

- **A pair means somebody took the question up.** 37 of 40 did. The other three
  are statements or fragments.
- **No pair does not mean no answer.** 38 of 60 were taken up within 12 s. The
  annotators drew few pairs, so about a third of real answers have none. `open` is
  not a negative. A score that treats it as one punishes a correct "answered".
- **`UNC` is not "nobody knew".** It is 9 of 346 questions, and about 4 of the 9
  are an "I don't know". The rest are hedges and talk that moved on.

So the outcome scores below use the pairs one way only: of the questions with a
gold answer, how many does the app call answered? The rest of the table is
reported, not scored.

## What was frozen before the test run

Chosen on tuning and training meetings only, and written here before any of it
was scored on test.

- **Rules**: branch `alex/question-rules` at 986acd1. `QUESTION_ANYWHERE` is gone.
  English questions are found where they open a clause, and adjacent asking
  sentences are quoted together.
- **Replies**: branch `alex/question-replies` at e33c2bc, on top of the rules.
- **Classifier**: `node scripts/question-eval.mjs train --out words-tiny.json
--alpha 0.1 --l1 6 --l2 1 --epochs 3`: 2,571 weights, 39 KB, trained on the 116
  training meetings. Threshold 0, mark 3 (`--threshold=0 --mark 3`). Threshold 0 is
  the highest with recall above the app's on tuning recognition.
- **Refine prompt**: `v1` in `scripts/question-eval.mjs`.

After the test run, review found that the noise check could backtrack without end on
a long hum (see "The patterns under attack"). Its fix is in the rules at 50e3b67, and
`isSpeaking` reads both partials in the replies at 240e35a. Neither changes a card: on
all 71,809 lines of text the benchmark reads, in every view and on every engine,
old and new give the same card and the same quote. So the scores stand.

## Results on test

Every number here was scored once, after the freeze above. The test meetings stay
unread: only totals were printed.

### The views

The 12 test meetings, 6.4 hours, strict set. Punctuation flatters the app, as the
brief warned: without it the app's F1 falls by 0.159 [0.107, 0.222].

| View       | App P / R / F1        | "?" alone P / R / F1  | Rules P / R / F1      | Classifier P / R / F1 |
| ---------- | --------------------- | --------------------- | --------------------- | --------------------- |
| (a) manual | 0.347 / 0.667 / 0.457 | 0.591 / 0.606 / 0.598 | 0.547 / 0.740 / 0.629 | 0.676 / 0.662 / 0.669 |
| (b) plain  | 0.247 / 0.375 / 0.298 | none                  | 0.593 / 0.460 / 0.518 | 0.705 / 0.285 / 0.406 |

### Real recognition

The 8 meetings with audio, 4 hours, strict set. "Kept" is the share of questions
with at least half of their words in the text: below that it is a recognition
miss, not a detector miss. "False" is false cards an hour.

| Engine, room           | Kept | App P / R / F1        | False | Rules P / R / F1      | False | Classifier P / R / F1 | False |
| ---------------------- | ---- | --------------------- | ----- | --------------------- | ----- | --------------------- | ----- |
| small.en, quiet        | 0.68 | 0.245 / 0.483 / 0.325 | 99    | 0.467 / 0.483 / 0.475 | 34    | 0.541 / 0.460 / 0.497 | 25    |
| small.en, steady       | 0.29 | 0.145 / 0.221 / 0.175 | 85    | 0.322 / 0.224 / 0.264 | 30    | 0.397 / 0.228 / 0.290 | 22    |
| parakeet-ultra, quiet  | 0.79 | 0.241 / 0.536 / 0.333 | 112   | 0.441 / 0.597 / 0.507 | 47    | 0.522 / 0.570 / 0.545 | 33    |
| parakeet-ultra, steady | 0.45 | 0.182 / 0.350 / 0.239 | 102   | 0.352 / 0.373 / 0.362 | 43    | 0.407 / 0.361 / 0.383 | 33    |
| apple-speech, quiet    | 0.75 | 0.223 / 0.567 / 0.320 | 132   | 0.344 / 0.589 / 0.434 | 72    | 0.422 / 0.578 / 0.488 | 51    |
| apple-speech, steady   | 0.37 | 0.159 / 0.338 / 0.216 | 123   | 0.262 / 0.335 / 0.294 | 66    | 0.289 / 0.316 / 0.302 | 53    |
| gpt-transcribe, quiet  | 0.72 | 0.249 / 0.475 / 0.326 | 97    | 0.479 / 0.532 / 0.504 | 36    | 0.544 / 0.517 / 0.530 | 27    |
| gpt-transcribe, steady | 0.33 | 0.169 / 0.262 / 0.206 | 88    | 0.316 / 0.274 / 0.293 | 38    | 0.362 / 0.262 / 0.304 | 30    |

Parakeet Ultra has AMI in its training data, so its rows are provisional until a
room that is not AMI is measured. These 8 meetings are AMI's standard test set, and
nothing was tuned on Parakeet.

On the broad set the order is the same: small.en quiet app 0.329, rules 0.465,
classifier 0.477; small.en steady app 0.169, rules 0.248, classifier 0.269.

**A miss is mostly recognition's.** In the quiet room small.en loses 83 of 263
questions outright. Of the 180 it keeps, the app caught 67%. In steady sound it
loses 186 of 263, and of the 77 it keeps the app caught 51%. Recognition is the
larger loss in both rooms, and no detector can recover it.

**Delay.** Median 1.2 s from the end of the question to the card, 90th percentile
5.2 s (small.en, quiet). 0.5 s and 3.2 s in steady sound, where segments are
shorter. Nothing in these changes adds to it: on the questions both methods catch,
the paired difference is 0 at the median and at the 90th percentile in all eight
rooms. Now and then a question's first card is later by up to 20 s: on main a
statement beside it had already raised a card that happened to overlap.

**The quote.** Quote F1 0.725 on main and 0.734 with the rules; 37.5% and 40.5% read
whole (small.en, quiet). On manual text with sentence ends it is 0.81. The limit is
that a segment can cut a question in two ("So basically what decisions." / "Have we
made?"). Two questions in one segment are now quoted together.

### The bars for the rules

Paired against main, per meeting, strict set. A star means the interval holds 0.

| Engine, room           | F1 gain               | Precision gain        | Recall gain              | Delay, median / 90th |
| ---------------------- | --------------------- | --------------------- | ------------------------ | -------------------- |
| small.en, quiet        | +0.150 [0.108, 0.181] | +0.222 [0.181, 0.261] | +0.000 [-0.022, 0.016]\* | 0 / 0 ms             |
| small.en, steady       | +0.089 [0.054, 0.118] | +0.177 [0.107, 0.238] | +0.004 [-0.024, 0.022]\* | 0 / 0 ms             |
| parakeet-ultra, quiet  | +0.175 [0.127, 0.215] | +0.200 [0.147, 0.244] | +0.061 [0.018, 0.093]    | 0 / 0 ms             |
| parakeet-ultra, steady | +0.123 [0.103, 0.141] | +0.170 [0.142, 0.193] | +0.023 [-0.005, 0.046]\* | 0 / 0 ms             |
| apple-speech, quiet    | +0.114 [0.068, 0.158] | +0.121 [0.076, 0.158] | +0.023 [-0.013, 0.065]\* | 0 / 0 ms             |
| apple-speech, steady   | +0.078 [0.060, 0.098] | +0.103 [0.077, 0.126] | -0.004 [-0.017, 0.009]\* | 0 / 0 ms             |
| gpt-transcribe, quiet  | +0.178 [0.138, 0.205] | +0.230 [0.187, 0.261] | +0.057 [0.018, 0.081]    | 0 / 0 ms             |
| gpt-transcribe, steady | +0.087 [0.061, 0.122] | +0.146 [0.114, 0.173] | +0.011 [-0.018, 0.039]\* | 0 / 0 ms             |

Bars 1 to 3 hold in all eight rooms. Bar 4 holds at the point estimate in seven; on
apple-speech in steady sound recall is 0.004 lower, within its interval. Bar 5, on
searches that open on a reply that does not say "I don't know": the rules alone keep
it in seven rooms and add one on parakeet-ultra in a quiet room (3 to 4). With the
reply branch on top it holds in all eight (the table under "Outcomes"), so the two
belong together. Bar 6: 5 µs a turn. Bar 7: all tests pass, and no other locale's
pattern changed.

**How much of the "false" is false.** I read 100 of the rules' false cards on
recognized tuning text: 42 are real questions the gold files as `sug` or `inf`, 14
are tags and checks, 7 rhetorical, 16 fragments, 2 backchannels, and 19 are
statements. So of about 36 false cards an hour, about 7 are plain statements. Counting
the real questions as right, precision is about 0.71, not 0.49.

### Question marks, engine by engine

"?" alone on the 8 meetings, strict set. Parakeet Ultra writes the best "?" in both
rooms, so it has no trade-off between speech and questions. Apple writes the most
and is right the least: a third of its "?" are on a question.

| Engine         | Quiet P / R / F1      | Cards an hour | Steady P / R / F1     | Cards an hour |
| -------------- | --------------------- | ------------- | --------------------- | ------------- |
| parakeet-ultra | 0.475 / 0.483 / 0.479 | 66            | 0.395 / 0.312 / 0.349 | 51            |
| gpt-transcribe | 0.550 / 0.407 / 0.468 | 50            | 0.368 / 0.221 / 0.276 | 41            |
| small.en       | 0.509 / 0.418 / 0.459 | 53            | 0.341 / 0.179 / 0.234 | 34            |
| apple-speech   | 0.355 / 0.525 / 0.423 | 98            | 0.262 / 0.316 / 0.287 | 81            |

Prompts: S's five context variants of gpt-transcribe on 3 meetings (48 questions)
give "?" F1 from 0.43 to 0.48 in a quiet room, and 0.32 to 0.42 in steady sound.
That is within noise on so few questions, so no prompt is shown to help. The sampled
runs of other engines (WhisperKit, Parakeet v3, Granite, every sixth segment) hold
38 to 45 questions each, too few to rank.

### Outcomes

Against the reader, a strong model that read what followed each question. It agrees
with my hand reading on 48 of 58 questions, so its error is about 1 in 6. "Right"
means answered or hedged on an answered question, denied or hedged on an unknown
one, and silence on an open one.

| Engine, room           | Outcome right, main | With replies | Answered left as silence, main | With replies | Searches, main (not "I don't know") | With replies |
| ---------------------- | ------------------- | ------------ | ------------------------------ | ------------ | ----------------------------------- | ------------ |
| small.en, quiet        | 0.750               | 0.843        | 0.179                          | 0.027        | 6 (2)                               | 1 (0)        |
| small.en, steady       | 0.759               | 0.807        | 0.139                          | 0.053        | 1 (0)                               | 0 (0)        |
| parakeet-ultra, quiet  | 0.690               | 0.820        | 0.200                          | 0.043        | 8 (3)                               | 2 (0)        |
| parakeet-ultra, steady | 0.703               | 0.798        | 0.150                          | 0.063        | 6 (4)                               | 2 (0)        |
| apple-speech, quiet    | 0.730               | 0.836        | 0.211                          | 0.063        | 15 (7)                              | 5 (0)        |
| apple-speech, steady   | 0.731               | 0.777        | 0.109                          | 0.059        | 5 (3)                               | 2 (1)        |
| gpt-transcribe, quiet  | 0.744               | 0.866        | 0.221                          | 0.049        | 9 (3)                               | 3 (0)        |
| gpt-transcribe, steady | 0.750               | 0.817        | 0.163                          | 0.083        | 2 (0)                               | 0 (0)        |

What the reply branch changed, each with tests in both directions:

- **Somebody still answering is not silence.** The 8 s wait ran out while a long
  reply was being said. A partial on screen now holds the verdict, for at most 30 s.
- **A yes answers a yes/no question.** "Is that okay?" "Yeah." was silence, because
  "yeah" is a backchannel everywhere else.
- **A plain no to a yes/no question is an answer**, unless it asked what somebody
  knows. "Do we need a remote?" "No." opened a browser.
- **A "no" inside a longer reply is no denial.** "There's no way we can do that" and
  "No, I think blue is better" opened a browser, because any English reply with a
  "no" in it counted. Catching more yes/no questions would have made this worse.

A note on the proxies: on manual text the silence problem looked three times larger
(0.6), because manual turns run long. Measured on recognition it is 0.18.

**One limit.** "Still speaking" reads the partial on screen, and Parakeet in a room has
no partials (`partials: null`), so the hold never engages there. The eval's `--no-hold`
measures that case: on parakeet-ultra outcomes are right 0.727 (quiet) and 0.745
(steady) rather than 0.820 and 0.798, and 19% and 13% of answered questions stay
silence. The search fixes hold either way. If Parakeet becomes the room default, the
main process needs to tell the renderer that a segment is open, whatever the engine.

### Branches

Tuning meetings, real recognition, F1 unless it says otherwise.

| Branch                     | Result                                                                                                                                                           | Verdict                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1. Rules                   | 0.464 against 0.286 (small.en), recall up. On test: table above.                                                                                                 | **Ships**                  |
| 2. Tiny classifier         | 0.504. On test +0.022 [-0.004, 0.051] over the rules, recall -0.023 [-0.043, -0.006]. Plain: 0.406                                                               | No: see below              |
| 3. MiniLM + linear         | 0.41 to 0.45 at the act level, against 0.66 for the words: mean-pooled vectors lose word order                                                                   | Stopped                    |
| 4. Pitch rise, last 400 ms | AUC 0.49 to 0.52 per segment, against 0.81 for the words. F1 0.519 with or without pitch, leave one meeting out. Per dialogue act: AUC 0.52, 0.651 against 0.645 | Stopped: one try           |
| 5. Context lines           | Act level: 0.664 with none, 0.667 with the next line. Would add delay                                                                                            | Stopped                    |
| 6. Local model refining    | QUEUED                                                                                                                                                           | QUEUED                     |
| 7. Cloud refining          | gpt-6-luna on test: +0.041 [0.025, 0.065] quiet, +0.008 [-0.008, 0.028] steady                                                                                   | Under the bar              |
| 8. Engine punctuation      | Table above. Prompts: no effect shown                                                                                                                            | Pick the engine for speech |

**Why the classifier does not ship.** It is good: hashed word and position n-grams,
logistic regression, 39 KB, 25 µs a turn, no key, no download. On words alone at the
act level it beats the transcribers' own "?" (F1 0.66 against 0.57). But against the
rules on real recognition it adds 0.008 to 0.054 F1 depending on the engine, with
recall lower in seven rooms of eight, and bar 4 says a question missed costs more than a
false card. Its recall falls to 0.285 without punctuation, where the rules hold 0.460. It
would also need CLAUDE.md's first question rule to say something other than "pattern
matching", and new weights for any change. Its code and trainer stay in the eval, so
this can be looked at again if recognition changes.

The tiny model's weights read as a learned copy of the rules: an auxiliary at the
start of a sentence, "you think", a trailing "or", and against "what I" and "what we".

**Cloud refining** is cheap (about $0.002 an hour) and takes 880 ms a card, and it
removes false cards well: of 52 cards it withdrew in the quiet room, 3 were right.
It stays under the bar because it can only remove cards: it cannot add a question the
rules missed. From a wider net (rules plus the classifier at -1) it reaches 0.518
quiet and 0.283 steady, +0.043 and +0.019 over the rules, with 30 more cards an hour
that appear and then vanish. Of the models tried on tuning text gpt-6-luna is as good
as gpt-6.1-terra and claude-sonnet-5-5, and claude-haiku-5-5 is close. gpt-5.4-nano
withdrew too many right cards. For OpenAI and Anthropic keys only: the card's line
and the lines before and after it leave the device.

### The operating point

A question missed costs more than a false card, but a screen of false cards breaks
trust. Rules have one point. The classifier shows the whole trade-off, on tuning
recognition (small.en, quiet):

| Threshold   | Precision | Recall | F1    | Cards an hour | False an hour |
| ----------- | --------- | ------ | ----- | ------------- | ------------- |
| -3          | 0.104     | 0.708  | 0.182 | 457           | 410           |
| -2          | 0.229     | 0.595  | 0.330 | 169           | 130           |
| -1.5        | 0.336     | 0.543  | 0.415 | 102           | 68            |
| -1          | 0.425     | 0.523  | 0.469 | 76            | 44            |
| 0           | 0.528     | 0.483  | 0.504 | 56            | 26            |
| 1           | 0.570     | 0.422  | 0.485 | 45            | 19            |
| 2           | 0.581     | 0.370  | 0.452 | 39            | 16            |
| **Rules**   | 0.435     | 0.497  | 0.464 | 70            | 40            |
| App on main | 0.207     | 0.465  | 0.286 | 145           | 115           |

Recall above 0.54 costs more than 60 false cards an hour. The curve is flat from
recall 0.45 to 0.52 and steep above it: what remains is not in the words. **Recommended
operating point: the rules.** Same recall as main, a third of the false cards.

### The site

The site says "Every question, caught as it's asked". On small.en the rules catch 48%
of the questions in a quiet room and 22% in steady sound; on Parakeet Ultra, 60% and
37%. Part of that gap is the gold: 13% of misses are statements the annotators filed
as questions, and 17% are fragments. Most of the rest is recognition. "Caught as it's
asked" holds: a card arrives about a second after the question. "Every question" does
not.

### Other languages

Not measured. Nothing here has a benchmark in the other nine locales, and AMI is
English. The rules change English patterns only: `INTL_QUESTION_PREFIX`,
`INTL_QUESTION_ANYWHERE` and `CJK_QUESTION_ENDING` are as they were, and on AMI text
they added 1 card in 614, so they do not leak into English. The reply changes apply to
English yes/no questions and to the English bare "no". `DENIAL_INTL` and its tests are
as they were. The 9 in 10 false-card finding may well hold for the anywhere patterns
of other languages, but it has not been read.

### The patterns under attack

These patterns run in the renderer on every final segment, so a slow one freezes the
app. Review of the rules caught exactly that: the first noise check was one repeated
pattern with an optional separator, so `mm+` could cut a run of m's in Fibonacci-many
ways, and a hum of sixty m's meant half an hour. It now reads one word at a time with
a sticky pattern that never goes back. `test/helpers/conversationAide.test.js` pins
long runs at the 600-character cap.

Every regex in the file was then attacked, by measurement: strings built from each
pattern's own words and separators at 600 characters, random mixes, then 500 mutations
keeping the slowest, and growth from 150 to 2,400 characters.

- Every pattern added or changed: 0.87 ms or less on first sight (`EN_YES_NO`), 0.01 ms
  or less re-timed, and no growth with length.
- The whole path on 23,465 hostile lines: 6 µs (`isQuestionCandidate`), 9 µs
  (`extractQuestionSentence`), 42 µs (`questionGroupKey`) and 34 µs
  (`assessResponseLocally`, three replies) on average. The worst single run was 6.6 ms
  on a machine at load 150, and that line re-timed alone takes 0.03 ms or less.
- One existing pattern does grow: `QUESTION_LEAD_IN` on main, 89 ms at 600 characters on
  a long run of spaces, from adjacent `\s+` and `\s*`. It cannot be reached that way,
  because `questionGroupKey` collapses white space first.

The noise check keeps what it counted: of 2.7 million random token strings none stopped
being noise. Hums that end in `-hmm`, such as "mmm-hmm" and "um-hmm", now count as noise
where they did not. None of those occurs in the text above.

### Grouping

`questionGroupKey` has no gold in AMI. On tuning recognition 6 of 382 cards share a
group, in 3 groups, and all 3 are the same question asked twice ("What do you think?",
"Do you think?"). It does not over-merge. Whether it under-merges cannot be told here.

### What a winner costs

| Method  | Speed here       | Base M-series, 16 GB (estimate) | Memory | Download | Licence       | What leaves the device |
| ------- | ---------------- | ------------------------------- | ------ | -------- | ------------- | ---------------------- |
| Rules   | 5 µs a turn      | under 50 µs                     | none   | none     | MIT, the repo | nothing                |
| Replies | a few µs a reply | the same                        | none   | none     | MIT, the repo | nothing new            |

### Not done

- Turbo q5_0 is queued behind the GPU lock, so it is not in the tables.
- The classifier and refiners were tuned on small.en and gpt-transcribe only.
- Only one recognizer's tuning text exists for steady sound (small.en), and it was
  not used to choose anything.
