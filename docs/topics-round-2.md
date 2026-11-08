# Topics, round 2: separation, names and gists, above all with no cloud key

Question (Alex, 2026-11-05): "better transcription and summarization of topics".
Round 1 (`docs/fast-models.md`) showed that the live view is good with a cloud
key and no better than one topic for the whole meeting without one. This page
asks what a person with no key can get, and whether anything new beats the
cloud winners.

## The answer

- **Separation with no key: solved.** A small change detector on this computer
  (#170) takes the live view from Pk 0.356, no better than one topic, to **0.264**
  on the 24 meetings it never saw, Δ −0.092 [−0.130, −0.051], and a change shows
  after 1.1 minutes instead of 3.9. On small.en in a quiet room, 19 meetings: 0.283
  against 0.380. On real research meetings main scored 0.510 and the detector
  about 0.22 (one topic: 0.278). It costs a quarter of a millisecond a turn, no
  download, nothing leaves the device.
- **The cloud loop's lead on separation is gone.** gpt-5.6-terra 0.258 against the
  detector's 0.264: a tie. On recognized text in a quiet room the detector is
  ahead. A key still buys recall (two to three times the changes found) and names.
- **Names with no writing model stay short of the bar**: 3.48 against 3.6. A phrase
  somebody said cannot state a subject. With Gemma 4 E4B, through the path the app
  has today, names go from 2.24 to 3.90 (bar 4.0, inside the interval).
- **A model on this Mac does not belong in the loop.** Gemma 4 E4B takes most
  proposals (Pk 0.318 against the detector's 0.266 on the same 12 meetings), and
  Apple's system model does worse (0.378). The detector alone is the better cutter.
- **Gists work with a key and not yet without one.** Opus 5.5 4.44 with 0.27
  invented facts, gpt-6.1-sol 4.31 with 0.19. Gemma 4 E4B 3.62 with 0.17: careful
  and thin. In a quiet room Opus holds the bar (4.18, 0.41). With steady sound
  nothing does.
- **No new cloud model**, and no default changes.

### Against the bar

| Class | Separation | Names | Other | Verdict |
| --- | --- | --- | --- | --- |
| On device, no writing model | **0.264**, gain −0.092 [−0.130, −0.051]; test meetings 0.266, gain −0.114 [−0.166, −0.055]: **met** | 3.48, gain +0.105 [−0.104, +0.320]; test meetings 3.47: **not met** | change drawn after 1.1 min | separation yes, names no |
| Gemma 4 E4B in the loop | 0.318 on the test meetings: **not met** | 3.90 on N2: **not met** | no time counts: loaded Mac | no |
| Apple's system model in the loop | 0.378: **not met** | 3.43: **not met** | | no |
| Cloud | no new default: gain of the new proposer −0.005 [−0.038, +0.028] | no new model | | no change |
| Gists | | | Opus 4.44, 0.27 invented: **met**. gpt-6.1-sol 4.31, 0.19: **met**. Gemma 3.62, 0.17: **not met** | yes with a key, no on this Mac |

## The bar, written before the runs (2026-11-05)

Baselines on eval24, the 24 meetings of round 1. Reproduced before any change:
on-device live Pk 0.356, record Pk 0.331, one topic 0.345.

| Class | Separation | Names | Other |
| --- | --- | --- | --- |
| On device, no writing model | live Pk ≤ 0.30, gain interval excludes 0 | judge ≥ 3.6, gain interval excludes 0 | delay reported |
| Local writing model in the loop | live Pk ≤ 0.29 | judge ≥ 4.0 | replies keep up with the room |
| Cloud | a new default only if the gain's interval excludes 0 | the same | |
| Topic gists | | | judge ≥ 4.0, under 0.5 invented facts a topic |

### Split

- **eval24** is the score: the 12 standard test meetings (ES2004, IS1009,
  TS3003) and the 12 spread tuning meetings of round 1. No choice on this page
  was made on them: every parameter, feature and prompt was chosen on **learn83**.
  A win must hold on eval24, and the 12 standard test meetings are shown beside
  it, because they are the split the brief names. With 12 meetings their
  interval is wide, so a row that passes eval24 and fails there says so.
- **learn83** is every tuning meeting whose series (the four meetings a group
  held) is not in eval24: 83 meetings. A meeting of a series in eval24 is never
  used to learn or tune, so no person and no project crosses the split.
- Intervals are 95% bootstrap intervals over meetings, paired against main on
  the same meetings.

### Instruments

- **Separation**: Pk and WindowDiff against AMI's top-level topics, as
  `scripts/topic-eval.mjs` and `scripts/topic-loop-eval.mjs` score them. "Live"
  is the view at the end of the meeting, as in round 1. Delay: the median time
  from a real change to a drawn change within a minute of it.
- **Names** have two instruments, and round 1's numbers mix them.
  - N1, `scripts/topic-eval.mjs --judge` (#123, #124): one judge rates the
    labels of the tracker's own topics, 1 to 5, against the annotators'
    description. The on-device 3.22 to 3.40 comes from this one.
  - N2, `scripts/topic-names-oracle.mjs` and `scripts/topic-names-judge.mjs --which
    record` (N, 2026-10-28): every namer names the annotators' topics, and two
    judges grade relevance and specificity, blind and shuffled. The cloud's 4.55
    and 4.25 come from this one.

  The on-device bar (3.6) is read on N1, its own baseline's instrument. The
  local-model bar (4.0) is read on N2, beside the cloud numbers. Both namers are
  shown on both where it can be done.

## What the app shows for a topic today (2026-11-05)

- **The record** (`notes.conversation_topics`, written at Finish) holds, for each
  topic: its id, label, eight fingerprint words, time spent, turn ids, first and
  last time, returns, state and, when vectors were there, one stored vector.
  No sentence about the topic.
- **While recording**, the flow card (`ConversationFlow.tsx`) draws lanes or the
  graph. Pressing a topic shows its label, a time and one quote under them, on
  two fixed lines. The quote is the topic's last turn (`quotedUtterance`).
- **In Intelligence**, pressing a topic opens the panel in
  `OatsWorkspace.tsx` (line 1298): label, time, returns and the questions asked
  on it.
- **No per-topic summary exists on any route.** The only thing near it: the live
  check (`topicLoop.mjs`, OpenAI and Anthropic routes) asks for a `gist` of at
  most 12 words for each topic it starts. It is sent back to the model in the
  next requests' topic list. It is never shown, and it is dropped at Finish.
  `conversationLinkStore`'s `gist` is the opening of the conversation's summary,
  not a topic's.
- **Where a gist would go**: the Intelligence panel first (it does not change
  while anybody speaks), then the quote row of the flow card, which fits two
  lines. Stored as one more field on each node of `conversation_topics`.

## Separation on this computer

### What was tried, on learn83

Every row here was tuned on learn83, with its best settings chosen there, and
none of them saw eval24. One topic for the whole meeting scores 0.325 on these
meetings. "Live" means the method reads only what has been said so far.

| method | Pk | live? | verdict |
| --- | --- | --- | --- |
| main's lexical tracker | about 0.33 | yes | the baseline |
| TextTiling on words, 4 min windows | 0.315 | no, needs 4 min after the pause | beaten |
| TextTiling on MiniLM vectors, 4 min windows | 0.307 | no | beaten |
| C99 on vectors, 3 cuts given | 0.297 | no, reads the whole meeting and needs the count | beaten |
| BayesSeg-style dynamic programming on words | 0.330 | no | no better than one topic |
| penalized change points on vectors (TextSplit style) | 0.384 | no | worse than one topic |
| GraphSeg style on vectors | 0.356 | no | worse than one topic |
| boosted trees on vectors alone | 0.305 | yes | better, not enough |
| boosted trees on vectors and words | 0.28 | yes | better |
| logistic regression on all features | 0.25 to 0.28 | yes | close, loses outside AMI |
| **boosted trees on all features** | **0.24** | **yes** | **the winner** |

The trees also beat every classic method that reads the whole meeting, while
they read only 45 seconds past each pause.

### The change detector

`src/helpers/topicChange.mjs` reads each pause 45 seconds after it. It computes 29
numbers: how alike the talk is on the two sides, in vectors and in words, over
windows of 30 s, 1, 2 and 4 min; how much of what follows was never said before;
how fast people talk on each side; the pause and the length of the turns next
to it; and whether the next turn opens like a new subject. 150 small trees turn
them into one score (`topicChangeModel.mjs`, 25 KB of JS). A pause over the
threshold becomes a cut when 15 more seconds bring no stronger one, at least 90
seconds after the last cut.

What each choice was worth, on groups of people held out of training:

- **Training on real meetings too.** Trained on AMI alone, the detector drew 1 to
  3 cuts in an hour of ICSI. AMI is role play with an agenda. ICSI is research
  groups at work. Training on both, with AMI's turns weighted double, gave Pk
  0.24 to 0.25 on AMI and 0.22 on ICSI.
- **A target of 15 seconds around each change** in place of the exact turn: AMI
  0.27 to 0.26, ICSI 0.23 to 0.22. Turns in a recording are shorter than AMI's,
  so a target in seconds carries over.
- **The lag barely matters.** 30 s 0.255, 45 s 0.24, 60 s 0.25, 90 to 240 s the same.
  So it reads 45 s, and a change shows about a minute after it.
- **Cue words stay.** Without them: 0.289 against 0.245 on the 12 tuning meetings
  replayed through the app's code with a model that never saw them; on ICSI the
  two tie. They are read after filler, from the first words of a turn.
- **No gain, dropped**: running z-scores of each feature, a TextTiling depth
  score, the centroid of the topic so far, time since the last cut (each with the
  detector's own cuts), monotone constraints on the trees, smoothing the score,
  vectors of the content words alone (0.238 against 0.239).

### Result on eval24

The model was frozen before it first read eval24, and this is its one run. The
file in #170 is that model, byte for byte, and a rerun on #170's code gives the same
numbers. Lower is better. Δ is paired against main, with its 95% interval over
meetings.

| 24 meetings, 12.5 h | live Pk | Δ against main | WindowDiff | record Pk | Δ against main | runs (people: 8.0) | boundaries P / R | real change drawn, after | old lines moved an hour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main | 0.356 | | 0.377 | 0.331 | | 6.2 | 49% / 36% | 43%, 3.9 min | 206 |
| **change detector** | **0.264** | **−0.092 [−0.130, −0.051]** | 0.292 | **0.257** | **−0.074 [−0.108, −0.037]** | 4.3 | 66% / 31% | 40%, 1.1 min | 29 |
| one topic | 0.345 | | | | | 1 | | | |

The 12 standard test meetings alone: 0.266 against main's 0.380, Δ −0.114 [−0.166,
−0.055]. **The separation bar is met, on both sets.**

It draws fewer topics than the annotators did. That is the price of precision:
two of three cuts it draws are real, and it finds a third of the real ones. A
lower threshold finds more and loses Pk (on learn83: 0.29 finds half at Pk 0.25 to
0.26, with one cut in three wrong).

### Outside AMI

AMI is role play: four people, a brief, a project manager with an agenda. The
ICSI corpus (75 meetings, 70 hours, CC BY 4.0) is research groups at their real
weekly meetings, closer to the people Oats is for. No cloud model read it.

| ICSI, 75 meetings | live Pk | record Pk | runs (people: 9.3) |
| --- | --- | --- | --- |
| one topic | 0.278 | 0.278 | 1 |
| main | **0.510** | 0.394 | 14.6 |
| change detector, groups held out of training | 0.216 to 0.229 | | 4 to 5 |

Main is far worse than one topic here: it draws 15 runs an hour with a third of
them right. This is what Alex saw in his own conversation.

Trained on AMI alone, the detector does not carry over: it still beats one topic
(0.266) but draws 1 to 3 cuts in an hour. So the shipped model learned from both
corpora. ICSI numbers here come from models that did not see that research
group. The detector's cue words help on AMI and do nothing on ICSI.

A real conversation between two people has no annotated corpus here, and it is
the app's main case. Treat the detector there as measured on neighbours.

### What the app pays

- **Speed**: 0.25 ms a turn at a load of 140 on this Mac, worst turn 16 ms. It
  will not show on a base M-series Mac.
- **Memory**: the turn's vector, which the tracker keeps today for the names.
- **Download**: none. It reads the bundled all-MiniLM-L6-v2. The model is 25 KB
  of JS in the app.
- **License**: the code is the app's (MIT). The trees are learned from AMI and
  ICSI annotations (CC BY 4.0), with the attribution in the generated file.
- **What leaves the device**: nothing.

### Sentence vectors

Held-out groups on learn83, AMI alone. L screens the same models for links.

| model | size | all features | vectors alone |
| --- | --- | --- | --- |
| all-MiniLM-L6-v2, bundled | 90 MB | 0.239 | 0.305 |
| granite-embedding-small-english-r2 | 97 MB | 0.237 | 0.320 |
| bge-small-en-v1.5 | 133 MB | 0.229 | 0.290 |
| EmbeddingGemma 2, 768 dims | 175 MB | 0.224 | 0.296 |
| EmbeddingGemma 2, first 256 dims | 175 MB | 0.225 | 0.302 |

A better model is worth about 0.01 to 0.015, which is near this table's noise, and
this table is manual text. **MiniLM stays.** The detector's cost is the vector the
app already makes for each turn: 4.5 ms of one CPU thread for MiniLM, against 8.4
for bge-small and 164 for EmbeddingGemma 2 (L's table, `models/embed/README.md`).
L also found that bge-small's cosines sit in a narrow band that moves on recognized
text, while MiniLM's move far less. That is why the check below is on recognized
text, and why a new embedder needs the detector trained again.

### Cue signals

- **Silence**: the pause before a turn is in the model; it helps a little.
- **Discourse markers** ("okay, so", "let's look at"): worth 0.01 to 0.04 on AMI,
  nothing on ICSI.
- **Who is speaking**: with the true speakers of the manual transcript, as a
  perfect live diarizer would give, no gain (AMI 0.237 against 0.242, ICSI 0.221
  against 0.215, near this table's noise). Topics do not need live speaker
  labels.
- **Question marks**: not used. Recognition does not reproduce the manual
  transcript's punctuation.

## Names on this computer, with no writing model

**The bar is not met.** With no writing model a name is a phrase somebody said.

| N1, the labels of the tracker's own topics | main | detector | gain |
| --- | --- | --- | --- |
| eval24 (bar 3.6) | 3.37 | **3.48** | +0.105 [−0.104, +0.320] |
| the 12 standard test meetings | 3.25 | 3.47 | +0.216 [−0.026, +0.446] |

The detector's purer topics lift the names a little. The rest was tried on 28
learn meetings, against main's 3.38 and the detector's 3.41 to 3.45, and each
stayed inside the judge's noise: the label score's weights (distinctive words,
counts, vector weight), two phrases in one name ("buttons and functionalities",
3.43 to 3.47, and it reads like the "random two words" Alex rejected), and a term
for phrases said across the whole topic (3.44 to 3.50). The label is limited by
what it is: the room's words for a subject, not a statement of it.

N2 shows the gap, on the annotators' own topics of eval24 ((relevance + specificity)
/ 2, Sonnet 5.5 and gpt-6.1-sol, two repeats each): Opus 5.5 4.64, gpt-6-astra 4.42,
gpt-6-luna 4.13, on-device phrases 2.24. Round 1's 4.55 and 4.25 came from another
batch of candidates; a judge reads each name beside the others, so compare inside a
table.

## Local writing models

**The loop stays off for models on this computer.** Names and gists on eval24, the
loop on the 12 standard test meetings. These runs shared a Mac at a load of 100 or
more, so Qwen and Gemma ran on the CPU, with a reply taken as 3 s on the replay's
clock: **accuracy only, no time here counts.** Bar for a model in the loop: Pk 0.29,
names 4.0, replies that keep up.

| 12 test meetings | live Pk | Δ against the detector alone | names shown, relevance / specificity | runs | P / R |
| --- | --- | --- | --- | --- | --- |
| one topic | 0.366 | | | 1 | |
| main | 0.380 | | | 5.9 | 44% / 31% |
| **detector alone** | **0.266** | | 2.63 / 1.97 | 5.0 | 62% / 36% |
| detector, Gemma 4 E4B names through #121 | **0.266** | | 3.14 / 3.18 | 5.0 | 63% / 36% |
| Gemma 4 E4B checks, detector proposes | 0.318 | +0.052 [−0.044, +0.148] | 3.76 / 3.56 | 11.5 | 50% / 75% |
| Apple's system model checks, detector proposes | 0.378 | +0.111 [+0.044, +0.178] | 3.23 / 3.09 | 11.0 | 43% / 61% |
| gpt-5.6-terra checks, detector proposes | 0.241 | | 3.81 / 3.60 | 6.8 | 67% / 55% |

The models that fit a Mac say yes too often. Gemma takes most proposals and cuts
into 11 pieces, which reads well against the annotators' finest level (Pk 0.286)
and badly against their topics. So the detector alone beats a local model in the
loop on separation. The loop does buy names: Gemma's as shown are near terra's,
because it names each small piece as it starts. **Neither local row clears the
bar** (0.29 and 4.0). The way to run a Mac with no key is the detector with #121's
names, as the app does once #170 lands. It needs no new request pattern, so the
reply time and the contention with the aide and whisper do not decide anything, and
they were not measured on this loaded Mac (`loop` runs: 42 to 52 requests an hour).
Qwen3.5 4B's loop was not run: it is below Gemma on names and gists.

**Apple's system model** (FoundationModels, macOS 26 and later; no download, no key,
available on this Mac, `fm-bridge`) refused 3 of 169 gists on its guardrails and
repeats itself: it gave one name to many topics, and #121's check dropped 65 of 176.
It stays behind Gemma on all three scores below. On a Mac with no model downloaded
it is still better than no writing model at all for names, and it would need a route
in the app.

| names, N2: (relevance + specificity) / 2 | pooled [95%] | gpt-6.1-sol | Sonnet 5.5 | names kept |
| --- | --- | --- | --- | --- |
| claude-opus-5-5, medium | 4.64 [4.60, 4.67] | 4.85 | 4.42 | 174/176 |
| gpt-6-astra, low | 4.42 [4.32, 4.50] | 4.76 | 4.09 | 176/176 |
| gpt-6-luna, none | 4.13 [4.00, 4.21] | 4.48 | 3.79 | 166/176 |
| **Gemma 4 E4B** | **3.90 [3.79, 4.02]** | 4.28 | 3.52 | 174/176 |
| Qwen3.5 4B | 3.77 [3.56, 3.84] | 4.19 | 3.35 | 157/176 |
| Apple's system model | 3.43 [3.27, 3.59] | 3.85 | 3.01 | 111/176 |
| phrases, no writing model | 2.24 [2.09, 2.31] | 2.49 | 1.98 | 176/176 |

| gists | judge (Fable, gpt) | invented | gold covered | words |
| --- | --- | --- | --- | --- |
| Gemma 4 E4B, manual transcript | 3.62 (3.39, 3.85) | **0.17** | 44% | 24 |
| Qwen3.5 4B, manual transcript | 3.56 (3.37, 3.75) | 0.75 | 55% | 32 |
| Apple's system model, manual transcript | 3.47 (3.23, 3.72) | 0.34 | 48% | 24 |
| Gemma 4 E4B, small.en quiet, prompt for recognized text | 3.12 (2.92, 3.31) | 0.45 | 36% | 24 |
| Gemma 4 E4B, small.en steady, prompt for recognized text | 2.23 (2.08, 2.38) | 0.97 | 15% | 23 |

- **A local writing model is worth more than anything else for names**: 2.24 to
  3.90 for Gemma, without the loop, through #121, which the app has today. It
  falls just short of the bar; 4.0 is inside its interval.
- **Gemma's gists are the most careful of any model here** (0.17 invented, against
  Opus's 0.27), and thin: 44% of what the annotators wrote down. They miss the bar
  of 4.0 by being short, not by being wrong. Asking for two full sentences of 25 to
  35 words did not lift them on learn meetings (one judge: 3.71 against 3.78, and
  invented facts 0.30 against 0.16).
- **On recognized text the gists are not good enough to show**: 3.12 in a quiet
  room. A model that writes little from little has nothing left when a third of
  the words are gone.
- **Qwen3.5 4B** is below Gemma on both, and fails on invented facts.

## Cloud

**No new model.** `GET /v1/models` today, against `scripts/lib/fast-models.mjs`:
OpenAI's newest text model is gpt-6.1-terra (2026-10-13), which round 1 measured.
What is listed and not priced is older (gpt-5, 5.1, 5.2, 5.4, 5.5 and their pro
models, gpt-4.1) or not a text model for this job (`gpt-live-1`, `chat-latest`, an
alias). Anthropic's list is the one round 1 used. gpt-4.1-nano is gone.

**What was new is the proposer.** The check confirms changes the tracker proposes,
so the detector can propose in its place, at a lower bar (threshold 0.28, spacing
60 s, hold 5 s). On 12 tuning meetings, with a model that never saw them, that took
gpt-5.6-terra from 0.203 to 0.143. **The gain did not hold on eval24:**

| eval24 | live Pk | Δ against main | WindowDiff | runs | P / R | drawn, after | $ an hour |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-terra, today's proposer | 0.258 | −0.099 [−0.154, −0.042] | 0.313 | 7.2 | 59% / 52% | 65%, 1.4 min | $0.116 |
| gpt-5.6-terra, detector proposes | 0.253 | −0.104 [−0.157, −0.048] | 0.297 | 6.4 | 65% / 51% | 63%, 1.0 min | $0.114 |
| claude-opus-5-5 low, detector proposes | 0.261 | −0.095 [−0.161, −0.030] | 0.319 | 9.7 | 58% / 72% | 83%, 1.0 min | $0.376 |
| gpt-6.1-terra none, detector proposes | 0.263 | −0.093 [−0.160, −0.026] | 0.317 | 9.7 | 56% / 70% | 80%, 1.0 min | $0.055 |
| **change detector alone, no key** | **0.264** | −0.092 [−0.130, −0.051] | **0.292** | 4.3 | 66% / 31% | 40%, 1.1 min | $0 |

gpt-5.6-terra with the detector against today's proposer: Δ −0.005 [−0.038, +0.028].
So **no default changes**: the proposer stays, and the eval keeps the option
(`proposerDetector`). Round 1's rule against screening on a few meetings held
again.

The last row is the finding. **On Pk the cloud loop no longer beats a person with
no key:** terra against the detector alone is Δ −0.006 [−0.050, +0.037]. What a
key still buys is recall (two to three times the changes found) and names.

The record changes for everyone: the on-device cut goes from 0.331 to 0.257, the
same as the loop's live view, with no request.

## Real recognition

Track S's replays: the app's segmenter and each recognizer, on the far-field
microphone, in a quiet room and with steady sound. One topic scores about 0.36 on
these meetings. Live Pk; lower is better. Parakeet's model card lists AMI in its
training data, so its rows are provisional. Apple Speech covers 23 of the 24
meetings of eval24, Parakeet the 12 standard test meetings, the others 8. Timing on
this page comes from a loaded Mac.

| recognizer, room | main | **change detector** | Δ against main | terra, today's proposer | terra, detector proposes | opus low |
| --- | --- | --- | --- | --- | --- | --- |
| small.en, quiet | 0.417 | **0.289** | −0.127 [−0.237, −0.044] | 0.319 | 0.292 | 0.301 |
| small.en, steady | 0.428 | **0.340** | −0.088 [−0.154, −0.020] | 0.304 | 0.339 | 0.331 |
| gpt-transcribe, quiet | 0.427 | **0.295** | −0.132 [−0.218, −0.052] | 0.324 | 0.338 | |
| gpt-transcribe, steady | 0.446 | **0.308** | −0.138 [−0.237, −0.051] | 0.300 | 0.326 | |
| Apple Speech, quiet (23) | 0.396 | **0.291** | −0.104 [−0.157, −0.055] | | | |
| Apple Speech, steady (23) | 0.386 | **0.322** | −0.064 [−0.103, −0.029] | | | |
| Turbo q5_0, quiet | 0.412 | **0.293** | −0.118 [−0.189, −0.055] | | | |
| Turbo q5_0, steady | 0.390 | **0.296** | −0.094 [−0.168, −0.021] | | | |
| Parakeet Ultra, quiet, provisional (12) | 0.434 | 0.308 | −0.126 [−0.204, −0.055] | | | |
| Parakeet Ultra, steady, provisional (12) | 0.455 | 0.323 | −0.132 [−0.203, −0.064] | | | |

- **The detector resists recognition errors.** Manual 0.264, recognized 0.283 to
  0.340, and every gain over main excludes 0. Main's tracker falls apart: misheard
  words break word overlap, and it scores worse than one topic in every room.
- **More meetings, same picture.** With track Q's small.en replays of 11 more
  meetings of eval24, the quiet room covers 19 meetings: 0.283 against main's
  0.380, Δ −0.096 [−0.163, −0.035]. The bar holds on real recognition.
- **It was checked before it was frozen**, on real recognition of 11 learn meetings
  (gpt-transcribe, $1.5): 0.274 against main's 0.373 and one topic's 0.339. Training
  on those meetings as well changed nothing, so they are not in the model.
- **Its turns are a different shape and it holds.** Recognized segments are about 4
  seconds and 10 words, manual turns 9 seconds and 25 words. ICSI's are like the
  recognized ones, which is one more reason it is in the training set.
- **It draws fewer cuts when the words are poor**: 4.4 a meeting in a quiet room, 2
  to 3.5 with steady sound, so it falls back toward one topic instead of inventing
  cuts. With Apple Speech in steady sound it found 11% of the changes.
- **The cloud loop's lead is gone here too.** In a quiet room the detector alone
  beats terra with either proposer. With steady sound terra stays ahead on small.en
  (0.304 against 0.340). No difference between them is outside its interval on 8
  meetings.

Names on the same meetings, as the flow card shows them, by one judge (gpt-6.1-sol,
relevance / specificity):

| | manual | small.en, quiet | small.en, steady |
| --- | --- | --- | --- |
| terra's check | 3.52 / 3.38 | 3.46 / 3.39 | 2.78 / 2.70 |
| detector's topics, on-device names | 2.64 / 1.97 | 2.80 / 1.80 | 2.46 / 1.63 |

A quiet room costs the names nothing. Steady sound costs a model's names about 0.7,
because the words are gone (S: 40% of content words recognized), and the on-device
names lose 0.2 to 0.3.

## Topic gists

One or two sentences for each topic, from its own turns (at most 3,000 characters,
the rule for topic names), for 169 stretches the annotators marked in eval24.
`scripts/topic-gist-eval.mjs`. The gold is AMI's summary sentences that rest on
each stretch (AMI's `summlink` files tie them to dialogue acts). Two judges, Fable
5.1 and gpt-6.1-sol, read the stretch's manual transcript and grade each gist
blind: 1 to 5, the summary sentences it covers, and each claim the stretch does not
support. Times come from a loaded Mac. Bar: 4.0 and under 0.5 invented facts a topic.

| from the manual transcript | judge (Fable, gpt) | invented | gold covered | words | $ a gist |
| --- | --- | --- | --- | --- | --- |
| claude-opus-5-5, medium | **4.44** (4.44, 4.44) | **0.27** | 72% | 35 | $0.0073 |
| gpt-6.1-sol, low | **4.31** (4.17, 4.45) | **0.19** | 66% | 31 | $0.0017 |
| gpt-5.6-terra, none | **4.12** (3.96, 4.27) | **0.32** | 63% | 31 | $0.0018 |
| gpt-6-luna, none | **4.09** (3.95, 4.23) | **0.40** | 63% | 37 | $0.0001 |
| claude-haiku-5-5, low | 4.04 (3.97, 4.12) | 0.61 | 67% | 44 | $0.0001 |
| the central turn, no model | 1.60 | 0.04 | 6% | 40 | $0 |
| the last turn, what the flow card quotes today | 1.26 | 0.14 | 2% | 22 | $0 |

A quote is not a gist: with no writing model there is nothing worth showing.

| from recognized text | judge | invented | gold covered |
| --- | --- | --- | --- |
| Opus, small.en quiet, prompt for recognized text | **4.18** | **0.41** | 60% |
| Opus, small.en quiet, same prompt as above | 4.17 | 0.58 | 64% |
| gpt-6.1-sol, small.en quiet, prompt for recognized text | 3.77 | 0.35 | 51% |
| gpt-6-luna, small.en quiet | 3.63 | 0.77 | 58% |
| Opus, small.en steady, prompt for recognized text | 3.28 | 0.95 | 44% |
| gpt-6-luna, small.en steady | 2.63 | 1.34 | 29% |

The prompt for recognized text tells the model to leave out what looks misheard. It
was chosen on 11 learn meetings (Opus 4.13 / 0.54 to 4.23 / 0.45). It takes the
invented facts under the bar in a quiet room. With steady sound no model clears it:
the words are gone.

## Decisions for Alex

1. **The change detector (#170): yes.** In a room, in English. It is the largest gain
   for a person with no key, at no cost, and it also takes the record from 0.331 to
   0.257 for everyone. It draws fewer topics than people do (4.3 against 8.0); if
   that feels thin in use, the threshold is one number.
2. **Gists: yes with a key, and they need a surface.** Opus 5.5 (4.44, 0.27 invented)
   or gpt-6.1-sol (4.31, 0.19), one request per topic at Finish with the prompt for
   recognized text, in the Intelligence panel. They carry over a quiet room and not
   steady sound (3.3, about 1 invented fact), so a recording that sounded bad should
   skip them. This track built no UI.
3. **Gists on this Mac: not by the bar.** Gemma 4 E4B's are careful and thin (3.62,
   0.17 invented), and on recognized text 3.12. My recommendation: do not show them
   yet. A quote is not a substitute (1.3 to 1.6).
4. **The loop on models on this Mac: no.** This was the direction to decide. It
   fails its bar, and the detector alone cuts better. No PR.
5. **Apple's system model**: no route for now. Its names (3.43) beat phrases (2.24)
   with no download, which is worth a look only for a Mac with no writing model, and
   it refuses some text and repeats names.

## Spend, downloads, what was not done

**Spend**: $55.5 of API calls on public AMI data: $53.95 in the ledger (OpenAI $22.23,
Anthropic $31.72), and about $1.50 of gpt-transcribe over 11 learn meetings, an
estimate at $0.0045 a minute. ICSI was read only on this Mac.

**Downloads**, public corpora, each CC BY 4.0: `ICSI_plus_NXT.zip` (55 MB,
groups.inf.ed.ac.uk), and the Array1-01 audio of 11 learn meetings (649 MB, the AMI
mirror). PyPI: numpy, scipy, scikit-learn, lightgbm, in `venvs/topics`. No model
weights.

**Not done, or stopped:**

- **Reply time and contention for a local model in the loop.** This Mac stayed at a
  load of 100 or more. The loop fails its bar on accuracy, so these no longer decide
  anything. `contention.mjs` was written and not run.
- **Withdrawn from the GPU queue, none of them run:** names and gists of Gemma 4 12B
  QAT and Nemotron 3.5 Bolt E4B; the loop with Qwen3.5 4B; small.en over the learn
  meetings (gpt-transcribe stood in for it); the learn-meeting runs of Gemma, Qwen and
  the system model, replaced by eval24 runs.
- **Not embedded**, stopped for the same reason, once MiniLM was decided: arctic-m,
  mxbai, nomic, Qwen embedding. Granite 4.2, LFM3, Gemma 4 E2B and Qwen3.8 were not
  tried in any role.
- **gpt-transcribe, Turbo and small.en beyond 8 to 19 meetings**, as S had published
  them. The steady-sound row for small.en holds 8.
- **A real conversation between two people.** No annotated public corpus was used,
  and note 6 is off limits. The detector is measured on meetings.
- **Other languages.** The detector is off for them.

## Reproduce

Public data only. `AMI=~/oats-asr-cache/AMI`, `ICSI=~/oats-asr-cache/ICSI/nxt/ICSIplus`
(`ICSI_plus_NXT.zip` from groups.inf.ed.ac.uk, 55 MB, CC BY 4.0). Keys come from the
environment. No cloud model may read ICSI: `--icsi` refuses any provider but this
Mac's. Spend is in the ledger (`FM_LEDGER`), stopped at `FM_BUDGET_USD`.

```sh
# The detector: features from the app's own code, then the trees (needs numpy, lightgbm)
node scripts/topic-change-features.mjs --ami $AMI --meetings <learn83> --lag 45 --out f/ami
node scripts/topic-change-features.mjs --icsi $ICSI --lag 45 --out f/icsi
python scripts/topic-change-train.py --data ami=f/ami --data icsi=f/icsi --hold 15 --spacing 90 \
  --threshold 0.35 --write src/helpers/topicChangeModel.mjs

# Separation (d1 main, d2 the detector), then paired differences
node scripts/topic-loop-eval.mjs --variant d2 --vectors --ami $AMI --set eval24 --json d2.json
node scripts/topic-paired.mjs --base d1.json --runs d2.json
node scripts/topic-loop-eval.mjs --variant d1 --icsi $ICSI --json d1-icsi.json

# On recognition output: one <meeting>.json a meeting
node scripts/topic-loop-eval.mjs --variant d2 --vectors --ami $AMI --replay ~/oats-asr-cache/replays/small.en__quiet-room --json d2-asr.json

# The check with the detector proposing, and the record from the detector
node scripts/topic-loop-eval.mjs --variant v4app --vectors --model openai:gpt-5.6-terra@none --ami $AMI --set eval24 \
  --options '{"deviceDetector":true,"proposerDetector":{"threshold":0.28,"spacing":60,"hold":5}}' --json v4-det.json

# Names: N1 and N2
node scripts/topic-eval.mjs --ami $AMI --meetings <eval24> --vectors --judge --tracker-options '{"detector":true}'
node scripts/topic-names-oracle.mjs --model anthropic:claude-opus-5-5@medium --ami $AMI --set eval24 --json names-opus.json
node scripts/topic-names-oracle.mjs --model device:minilm --ami $AMI --set eval24 --concurrency 1 --json names-device.json
node scripts/topic-names-judge.mjs --runs names-opus.json,names-device.json --which record --judge anthropic:claude-sonnet-5-5 --repeats 2

# A model on this Mac (llama-server, one model per hold of the GPU lock), or Apple's system model
lockf -k ~/oats-asr-cache/gpu.lock node scripts/topic-loop-eval.mjs --variant v1 --vectors --model local:gemma-4-e4b@grammar \
  --local-model <gguf> --llama-server <binary> --local-context 16384 --ami $AMI --set eval24 \
  --options '{"deviceDetector":true}' --json l1.json
lockf -k ~/oats-asr-cache/gpu.lock node scripts/topic-gist-eval.mjs generate --model fm:system --fm-bridge <binary> --ami $AMI --out gists

# Gists
node scripts/topic-gist-eval.mjs generate --model openai:gpt-6-luna@none --ami $AMI --set eval24 --out gists
node scripts/topic-gist-eval.mjs judge --judge anthropic:claude-fable-5-1@low --batch --ami $AMI --out gists
node scripts/topic-gist-eval.mjs judge --judge openai:gpt-6.1-sol@low --ami $AMI --out gists
node scripts/topic-gist-eval.mjs report --out gists --baseline anthropic_claude-opus-5-5@medium
```
