# Fast models in the loop: topics and transcript repair, measured

Question (Alex, 2026-10-26): fast, high-throughput models are cheap and quick
enough to call all through a conversation, not only now and then. Does a fast
model in the loop beat what Oats has, and by how much?

This page has the answer, the numbers, how they were measured, and what to
build. Every number comes from the scripts named here, on public data (the AMI
meeting corpus, CC BY 4.0), except one private conversation that only models on
this computer read.

## Decision (Alex, 2026-10-26) and V4 in the app

- **VF: no.** The record keeps the on-device cut at Finish, with #121's names
  on top.
- **Live view: V4**, only when the writing model is OpenAI's and there is an
  OpenAI key. Oats uses gpt-6-luna when the key can use it, else gpt-5.6-luna,
  and asks once a session (`GET /v1/models/{model}`, no tokens). Every other
  provider and every model on this computer keep #121's names as they were.

### What the app does

`src/helpers/topicLoop.mjs` is V4 as the app runs it, and
`src/stores/topicNamingRunner.ts` starts it for the recording.

- A second on-device tracker, set to propose early, proposes changes of
  subject. The fast model gets the topics' names and one-line descriptions and
  at most 3,000 characters of the lines around the change (and, after 250
  words with no check, the end of the current topic). It answers JSON
  (`text.format` json_schema, `reasoning: none`): the same subject, a new
  topic (where it starts, a name), or a return. The first topic is named at
  40 words; a topic is renamed only when it grew two and a half times.
- One request at a time, a 15 s timeout, about 41 requests an hour. A failed
  or timed-out request, or an answer that is not the JSON, changes nothing; the
  next request waits 10 s, then 20 s. Three in a row end the check for the
  recording, and so does a change of writing model away from OpenAI: the flow
  card goes back to the on-device topics, and #121 names them.
- Each line shows at once in the topic the room is on. An answer moves only
  lines shown less than 30 s ago (`MOVE_HORIZON_MS`, the rule asked for).
- Topic ids never change. At Finish the record keeps the tracker's cut; each
  name the check gave goes to the record topic that holds at least half of the
  lines it was named from, and #121's final pass names only the record topics
  without one. A topic the check named is never sent to #121 again.
- #121's name check keeps a six-word name now ("Six-word names" below). The
  prompts still ask for 2 to 5 words, and the 48-character limit stays. In the
  runs below the check's own names were refused 0 to 2 times in about 190;
  with the five-word limit, 2 and 42 times.

### Verification: the app's code on eval24

`scripts/topic-loop-eval.mjs --variant v4app` replays the 24 meetings through
the shipped module (12.5 hours). Δ is paired against main today (V1), per
meeting, with its 95% interval.

| | live Pk | Δ against main | real change drawn, after | lines older than 30 s moved per hour | requests per hour | $ per hour |
| --- | --- | --- | --- | --- | --- | --- |
| V4 in the experiment (3 runs) | 0.274 to 0.285 | −0.072 to −0.082, each excludes 0 | 67 to 71%, 1.3 min | 69 to 82 | 48 | $0.0067 |
| **app, gpt-6-luna, 30 s rule** (2 runs) | **0.394, 0.376** | +0.038 [−0.016, +0.092], +0.019 [−0.040, +0.076] | 57%, 0.8 min | 0 | 41 to 50 | $0.0054 to 0.0062 |
| app, gpt-6-luna, 90 s | 0.360 | +0.003 [−0.053, +0.061] | 60%, 1.3 min | 53 | 49 | $0.0063 |
| app, gpt-6-luna, no rule (3 runs) | 0.285, 0.301, 0.296 | −0.072 [−0.127, −0.015], −0.055 [−0.105, −0.005], −0.060 [−0.109, −0.013] | 60 to 71%, 1.3 to 1.6 min | 84 to 99 | 41 to 47 | $0.0057 to 0.0063 |
| app, gpt-5.6-luna, 30 s rule | 0.379 | +0.022 [−0.028, +0.073] | 52%, 0.8 min | 0 | 41 | $0.011 |
| app, gpt-5.6-luna, no rule (2 runs) | 0.347, 0.336 | −0.009 [−0.076, +0.059], −0.021 [−0.091, +0.049] | 62 to 66%, 1.3 to 1.4 min | 94 to 98 | 41 | $0.012 |
| main today | 0.356 | | 43%, 3.9 min | 206 | 25 | $0.002 to 0.004 |

One topic for the whole meeting scores 0.345. The record is main's in every
row (Pk 0.331). No request failed; 0 to 0.6% of answers were not the JSON;
latency 1.1 to 1.2 s at the median, 1.6 to 1.9 s at p95. The gpt-6-luna runs
that scored 0.394, 0.360 and 0.285 came before the last two changes: they kept
five-word names only, and sent 99 to 101 final-name requests in the 24
meetings instead of 18 to 25.

- **Without the 30 s rule, the app reproduces V4:** live Pk 0.285 to 0.301
  (the experiment: 0.274 to 0.285), a change drawn after 1.3 to 1.6 minutes,
  $0.006 an hour.
- **With it, the live gain is gone.** The model confirms a change a median 1.3
  minutes after it happened, so with the rule the lines in between stay in the
  old topic and the cut lands late: 0.376 to 0.394, no better than main and
  worse than one topic. At 90 s it is 0.360.
- **The moves are not flicker.** Without the rule, a confirmed change moves
  its lines in one step, 12 to 14 times an hour, about 7 lines older than 30 s
  each time; no change was taken back (0 to 0.1 an hour). Main's tracker moves
  206 old lines an hour today.
- **gpt-5.6-luna does not reproduce the gain**: 0.336 and 0.347, neither
  interval excludes 0, at twice the cost. It still names topics early.
- **The requests together carry most of the conversation**: 91 to 95% of the
  lines are quoted in at least one request, though no request carries more
  than 3,000 characters.

**For Alex to decide:**

1. **The 30 s rule.** Keep it (no segmentation gain, names only), drop it (V4
   as measured; old lines move as above), or use V2 instead, which keeps it by
   design: about 1 old line moved an hour, live Pk 0.254 to 0.266, a change
   after 0.4 min, but 198 requests and $0.025 an hour, and every line is sent in
   12 s batches (V4 sends 91 to 95% of them anyway). The rule is one constant,
   `MOVE_HORIZON_MS`, now 30 s; `Infinity` drops it.
2. **The fallback model.** Keep gpt-5.6-luna for its early names, or run the
   check only when the key can use gpt-6-luna.

## The answer

**Live: yes, a clear win, with the right model.** With gpt-6-luna (no
reasoning) in the loop, the flow card's topics are about a quarter more accurate
than main's on-device tracker, and a change of subject shows within half a minute
to a minute and a half instead of four minutes, for under 3 cents an hour.

| 24 AMI meetings, 12.5 h | live Pk | real change drawn after | names shown, relevance | requests per hour | $ per hour |
| --- | --- | --- | --- | --- | --- |
| main today (V1) | 0.356 | 3.9 min | 2.56 | 25 | $0.002 to 0.004 |
| V2: the model places each new line | 0.254 to 0.266 | 0.4 min | 2.70 | 198 | $0.025 |
| V3: the model re-cuts the last 4 minutes | 0.257 to 0.272 | 1.1 to 1.3 min | 2.56 to 2.63 | 87 | $0.013 |
| V4: on-device proposes, the model decides | 0.274 to 0.285 | 1.3 min | 3.13 | 48 | $0.007 |

Pk: lower is better; one topic for the whole meeting scores 0.345. Every live
difference against main is outside its 95% interval.

**With real recognition errors the live gain is larger.** On the 8 far-field
meetings as the app heard them (34.9% of words wrong), main's live view scores
0.426, worse than one topic for the meeting (0.356): misheard words break its
word overlap. V2, V3 and V4 score 0.24 to 0.33 over three runs each, every run
better than main with an interval that excludes zero.

**The record: one request at Finish names it far better.** VF cuts and names the
whole transcript in one request (4.5 s, $0.0016 an hour): record names go from
2.63 to 3.6 to 3.9 for relevance (Claude Sonnet 5.5, the ceiling: 4.22) and from
0.70 to 1.3 to 1.5 for match with the annotators; record Pk from 0.331 to 0.24.
Its segmentation gain is not sure: it cuts finer than AMI's top level, on the
tuning meetings its top-level Pk was not better, and on the far-field meetings
two of three runs were no better than today. The names' gain held in every run.

**It does not travel.** The same protocols with Claude Haiku 5.5, any Bedrock
small model, or the 1 to 2 B models that run on this Mac are no better than the
on-device tracker on manual transcripts, and no better than one topic for the
meeting on the far-field ones. Only OpenAI's small models, without reasoning,
clear the bar (gpt-6-luna, and gpt-5.6-luna, which the app already lists).

**Not built into the app**, because each winner needs a decision that is Alex's:
a live loop sends the conversation to the provider while it happens, and
VF sends the whole transcript once at Finish, while `docs/network-allowlist.md`
promises that topic requests carry "at most 3,000 characters of what was said on
that topic ... never the rest of the transcript". The live loop also needs a fast
model that is not the writing model. The proposal is below.

**Track 2: no.** Fixing far-field recognition errors with a fast model lowers the
error rate from 34.9% to 34.7% and makes 1 segment in 70 worse.

## What was compared

### Topic variants

| | What the flow card shows while recording | What the record gets at Finish | Requests |
| --- | --- | --- | --- |
| V0 | the tracker before #123 (`bff2230`), named by the writing model (#121) | the same tracker's final snapshot, final names | one per topic at 40, 100, 250 words, ... |
| V1 | main's tracker (#123, with #124's MiniLM names), named by the writing model (#121) | the tracker cut again with hindsight, final names | as V0 |
| V2 "turns" | at most every 12 s, once 30 new words wait (or 25 s after the oldest), the model places the new lines: the current topic, an earlier one, a new one it names, or "?" (wait for more) | the live topics, final names | about 200 an hour |
| V3 "window" | every 45 s, the model cuts the last 4 minutes again and names what it finds; ids stay stable | the live topics after one last cut, final names | about 90 an hour |
| V4 "hybrid" | the on-device tracker (set to propose early and often) proposes a change; the model confirms it, places it (new topic or a return) and names it; a topic that ran 250 words with no proposal is checked | the live topics, final names | about 50 an hour |
| VF "finish" | (nothing new: the on-device view) | the model cuts and names the whole transcript in one request | 1 per conversation |

"Final names" is the app's own final naming pass (`TopicNamer.finish`, #121),
so V0 to V4 name the record the same way; VF's names come from its one request.
D0 and D1 are the two on-device trackers with no model at all. All the model
variants are in `scripts/lib/topic-loop-variants.mjs`, written like
`helpers/topicNamer.mjs` (the model behind `ask`, the clock behind `now` and
timers), so the replay drives them as the app would.

Design choices that held up (each was tried both ways on 12 meetings that are not
in the evaluation set, below):

- **Answers name change points, not one label per line.** Asked for one label
  per new line, models miscounted the lines: 23 to 40% of answers were unusable
  for Claude Haiku 5.5, gpt-4o-mini and gpt-5.4-nano. Asked for segments
  (`[{"from": 3, "topic": "new"}]`), 0 to 0.4%.
- **Topics are given a time scale, not a count.** "A topic usually holds 2 to 10
  minutes of talk", with every topic's duration in the prompt. A count ("4 to 10
  topics in half an hour") made a 5-minute meeting into 8 topics.
- **A topic needs 40 words (60 in the record).** A run of lines shorter than that
  folds into the topic around it (`smoothRuns`), and a switch at the end of a
  batch waits for the next one. Without it, most of Haiku 5.5's topics in V3
  lasted under 20 seconds. It changes nothing for a model that cuts coarsely.
- **No reasoning.** gpt-6-luna with its default reasoning took 2.8 s per request
  (p95 9.1 s) against 1.1 s (1.9 s) with `reasoning: none`, and segmented worse.

### Models

Screened on the 12 tuning meetings (dev12, 5.4 hours) with V3 and VF, before the
40-word rule (which only changes models that cut too finely). Main's tracker on
the same meetings: live Pk 0.333, record 0.286, finest level 0.354, 4.8 runs (the
annotators drew 7.7). Bedrock models were run one meeting at a time: at the
replay's pace they were throttled (HTTP 429) on this account, which a single live
conversation (1 to 3 requests a minute) would not be.

| model | V3 Pk | V3 runs | V3 latency p50 / p95 | V3 $/h | VF Pk | VF Pk, finest | VF runs | VF latency p50 / p95 | VF malformed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-luna, reasoning none | **0.236** | 4.6 | 1.1 / 1.9 s | $0.013 | 0.358 | 0.289 | 13.8 | 5.6 / 9.3 s | 0% |
| gpt-6-luna, default reasoning | 0.296 | 7.4 | 2.8 / 9.1 s | $0.021 | 0.284 | 0.289 | 5.3 | 13.8 / 20.2 s | 25% |
| gpt-5.6-luna, reasoning none | 0.259 | 4.7 | 1.0 / 1.6 s | $0.027 | 0.385 | 0.288 | 13.8 | 4.6 / 7.0 s | 0% |
| gpt-5.4-nano, reasoning none | 0.313 | 6.6 | 0.9 / 1.4 s | $0.028 | 0.254 | 0.287 | 9.4 | 3.6 / 5.2 s | 0% |
| gpt-5-nano, minimal | 0.322 | 2.8 | 1.2 / 1.6 s | $0.009 | 0.290 | 0.372 | 3.0 | 1.6 / 2.4 s | 0% |
| gpt-5-mini, minimal | 0.322 | 1.0 (never cuts) | 1.0 / 1.4 s | $0.035 | 0.251 | 0.284 | 8.8 | 3.7 / 5.1 s | 0% |
| gpt-4.1-mini | 0.286 | 1.7 | 0.8 / 1.3 s | $0.048 | **0.232** | 0.297 | 5.7 | 2.5 / 3.0 s | 0% |
| gpt-4o-mini | 0.304 | 7.1 | 1.1 / 1.8 s | $0.021 | 0.301 | 0.310 | 7.3 | 4.0 / 7.0 s | 0% |
| Claude Haiku 5.5 | 0.419 | 16.7 | 1.4 / 2.2 s | $0.023 | 0.347 | 0.326 | 10.8 | 5.4 / 7.1 s | 8% |
| Bedrock Amazon Nova Micro | 0.323 | 6.7 | 0.6 / 1.0 s | $0.005 | 0.325 | 0.386 | 3.5 | 1.4 / 3.4 s | 17% |
| Bedrock Amazon Nova Lite | 0.373 | 11.8 | 0.7 / 1.4 s | $0.010 | 0.358 | 0.380 | 7.2 | 2.5 / 3.5 s | 8% |
| Bedrock Llama 3.1 8B | 0.340 | 7.0 | 0.6 / 1.1 s | $0.027 | 0.341 | 0.353 | 4.7 | 1.4 / 2.3 s | 0% |
| Bedrock Ministral 3 8B | 0.441 | 13.1 | 0.7 / 1.1 s | $0.020 | 0.394 | 0.336 | 10.7 | 5.1 / 7.2 s | 8% |
| Bedrock Gemma 3 12B | 0.496 | 11.8 | 0.8 / 2.1 s | $0.014 | 0.326 | 0.377 | 2.0 | 10.6 / 16.9 s | 42% |
| Bedrock Qwen3 32B | 0.385 | 11.0 | 0.8 / 1.5 s | $0.022 | 0.405 | 0.355 | 10.8 | 3.6 / 6.6 s | 17% |
| Bedrock Nemotron Nano 3 30B | 0.324 | 3.6 | 0.8 / 1.3 s | $0.009 | 0.336 | 0.396 | 1.9 | 1.2 / 2.2 s | 0% |
| On this Mac: Qwen3.5 2B (Q4_K_M) | 0.318 | 1.4 (hardly cuts) | 3.1 / 5.3 s | $0 | 0.294 | 0.376 | 2.5 | 15.9 / 81.9 s | 25% |
| On this Mac: LFM2.5 1.2B (Q4_K_M); V3 on the first 6 meetings only (main's record on those 6: 0.279) | 0.321 | | about 9 s (writes 400 to 550 tokens) | $0 | 0.348 | 0.389 | 4.7 | 19.0 / 47.9 s | 0% |

- Only gpt-6-luna and gpt-5.6-luna, without reasoning, are clearly better than
  main's on-device tracker (0.333 live, 0.286 record) in V3. The other OpenAI
  small models land near one topic for the meeting (0.322); every Bedrock model,
  Claude Haiku 5.5 and both models on this Mac are no better than the tracker.
- The same prompt gives each model its own granularity: gpt-5-mini never cuts,
  Haiku 5.5 and Ministral cut twice as often as the annotators. For VF the
  ordering changes again (gpt-4.1-mini is best at the top level because it cuts
  coarsely). Prompts would need tuning per model; the 40-word rule fixes the too
  fine models only partly (Haiku 5.5 in V3 on eval24: 12.9 runs, no gain).
- Claude Haiku 5.5 is not on Bedrock for this account (HTTP 403), and gpt-4.1-nano,
  which is in the app's model list, is retired (HTTP 404).
- V2 needs change points, not labels: with one label per line, 25% (Haiku 5.5),
  23% (gpt-4o-mini) and 40% (gpt-5.4-nano) of answers had the wrong number of
  labels.

## How it was measured

### Data

- **eval24**: 24 AMI meetings (12.5 hours) replayed from their manual
  transcripts, cut at pauses as the room segmenter cuts: the corpus' 12 standard
  test meetings (ES2004, IS1009, TS3003) and 12 others spread over the corpus
  (every tenth tuning meeting). Prompts and parameters were chosen on 12 other
  meetings (dev12), never on these.
- **far8**: the 8 AMI meetings recorded with the far-field microphone
  (ES2004a to d, IS1009a and b, TS3003a and b; 4.0 hours) as the app heard them:
  `scripts/room-replay.js` (#122), the live room path with its real recognition
  errors (word error rate 34.9%, `base.en`).
- **Alex's conversation of 2026-10-24** (28 minutes): models on this computer
  only. Its topic names are reported to Alex only.

### The replay

`scripts/topic-loop-eval.mjs` replays a conversation turn by turn on a virtual
clock. Each finalized line arrives 0.5 s after its speech ended. Requests are
real (the app's request shape for each provider) and their answers land when they
would have: a request that took 1.2 s changes the view 1.2 s of conversation
later. Lines that arrive meanwhile are handled as the app would handle them.
One request is out at a time per conversation.

### Scores

- **Segmentation**: Pk and WindowDiff against AMI's human topics, as
  `scripts/topic-eval.mjs` (#123) scores them; the copy here reproduces its test
  numbers exactly (Pk 0.359, WindowDiff 0.369). Lower is better; one topic for the
  whole meeting scores 0.345 on eval24. Two references: AMI's **top-level**
  topics (8.0 per meeting; the primary score, as in #123) and its **finest**
  topics (18.0 per meeting; a long "discussion" split into what it discussed).
  Scored for the live view at the end of the meeting and for the record.
- **Live delay**: for each real change of subject, how long until the flow card
  first draws a change within a minute of it ("drawn" is the share drawn at all).
  And for each line, how long until its topic stops changing ("settles").
- **Names**: `scripts/topic-names-judge.mjs`. One item per human topic segment of
  40 words or more (176 on eval24, 55 on far8). For each, every variant's name is
  taken twice: the name the flow card showed 30 s after the segment ended, and
  the record's name. The judge sees the segment's manual transcript (3,000
  characters, by the app's own excerpt rule), the annotators' label, the other
  segments' labels, and the names, unlabelled, deduplicated and shuffled. It
  grades relevance and specificity 1 to 5 and match with the annotators' label
  0 to 2, as #121's judge does. Judge: Claude Sonnet 5.5, two repeats with
  another shuffle; gpt-6.1-sol as a second judge, one repeat.
- **Behaviour and cost**: requests per hour, failures, malformed answers, latency
  per request (p50, p95), input, cached and output tokens per hour, dollars per
  hour (list prices, `scripts/lib/fast-models.mjs`), name changes per hour.

Intervals are 95% bootstrap intervals over meetings (segmentation) or over items
(names). "Paired" differences compare two variants meeting by meeting.

## Results: 24 AMI meetings, manual transcripts (eval24)

All with gpt-6-luna and `reasoning: none` unless the row says otherwise. Pk is
the mean over meetings; Δ is paired against today's app (V1) on the same
meetings, with its 95% interval. Live is the flow card at the end of the meeting;
record is what Finish saves. One topic for the whole meeting scores 0.345 (top
level) and 0.380 (finest level).

### Segmentation and delay

| | live Pk | Δ live | record Pk | Δ record | record Pk, finest level | runs per meeting (annotators: 8.0) | changes drawn, after | old lines moved per hour | a line settles (p90) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D0, V0: tracker before #123 | 0.339 | −0.018 [−0.058, 0.022] | 0.339 | +0.008 [−0.034, 0.043] | 0.365 | 5.8 | 26%, 0.3 min | 0 | 0 s |
| **D1, V1: main today** | **0.356** | | **0.331** | | **0.373** | 5.0 | 43%, 3.9 min | 206 | 352 s |
| V2 turns (2 runs) | 0.266, 0.254 | −0.090 [−0.155, −0.022] | 0.266, 0.254 | −0.065 [−0.129, 0.003] | 0.317, 0.306 | 6.3, 6.7 | 57%, 0.4 min | 1 | 0 s |
| V3 window (3 runs) | 0.267, 0.272, 0.257 | −0.089 [−0.154, −0.025] | 0.267, 0.271, 0.257 | −0.064 [−0.121, −0.004] | 0.336, 0.316, 0.316 | 5.2, 4.6, 5.1 | 45 to 48%, 1.1 to 1.3 min | 32 to 54 | 26 to 63 s |
| V4 hybrid (3 runs) | 0.285, 0.274, 0.279 | −0.072 [−0.119, −0.023] | 0.285, 0.274, 0.279 | −0.046 [−0.098, 0.003] | 0.297, 0.306, 0.313 | 8.2, 8.0, 7.3 | 67 to 71%, 1.3 min | 67 to 82 | 67 to 81 s |
| VF finish (3 runs) | (V1's) | | 0.245, 0.240, 0.242 | −0.086 [−0.158, −0.015] | 0.254, 0.257, 0.263 | 10.0, 9.7, 10.0 | | | |
| V3, gpt-5.6-luna (in the app's list) | 0.279 | −0.077 [−0.125, −0.030] | 0.278 | −0.053 [−0.100, −0.005] | 0.328 | 4.3 | 36%, 1.0 min | 30 | 23 s |
| VF, gpt-5.6-luna | | | 0.265 | −0.066 [−0.131, −0.000] | 0.266 | 11.3 | | | |
| V3, Claude Haiku 5.5 | 0.359 | +0.002 [−0.046, 0.053] | 0.359 | +0.028 [−0.029, 0.085] | 0.365 | 12.9 | 60%, 1.0 min | 145 | 189 s |
| VF, Claude Haiku 5.5 | | | 0.305 | −0.025 [−0.096, 0.039] | 0.268 | 12.3 | | | |
| VF, Claude Sonnet 5.5 (ceiling) | | | 0.253 | −0.078 [−0.147, −0.011] | 0.253 | 9.5 | | | |
| V3, Claude Sonnet 5.5 (ceiling, 2 meetings only) | 0.157 | | 0.157 | | 0.171 | 8.5 | 100%, 0.6 min | 44 | 38 s |

Δ is the first run's; the other runs' are within 0.015 of it. Over three runs the
24-meeting mean moves by at most 0.015; one meeting moves by about 0.05 (median
standard deviation), so read a single meeting with care, not the mean.

- **Every model variant beats the on-device tracker on segmentation**, live and
  in the record, at both levels, with gpt-6-luna. The live gains are the surest:
  the interval of every run excludes zero, and they held on the 12 tuning
  meetings too (live Pk: V2 0.284 and 0.308, V3 0.236 to 0.263, V4 0.299, against
  main's 0.333).
- **The delay is where the loop changes the most.** Main's tracker draws a cut
  only once it can no longer move: a real change of subject appears after a
  median of 3.9 minutes, and a line's topic is still moving 6 minutes after it
  was said (p90). V2 draws it after 24 seconds and moves about one line older than
  30 s an hour (main: 206). V3 and V4 take a little over a minute.
- **VF's record is the best at the top level here, but not everywhere.** It cuts
  finer than AMI's top level: about 10 topics where the annotators drew 8, and
  in 5 of the 24 meetings twice as many. On the 12 tuning meetings it was worse
  than the on-device record at the top level (0.333 against 0.286) and better at
  the finest level (0.297 against 0.354). At the finest level it is better on
  both sets.
- **The model matters more than the variant.** With the same prompts, Claude
  Haiku 5.5 cuts a meeting into 13 topics where the annotators drew 8 and is no
  better than the on-device tracker. Claude Sonnet 5.5 is the ceiling: V3 with it
  scored 0.157 on two meetings (gpt-6-luna on the same two: 0.180 to 0.229 over
  three runs; main today 0.416), at $0.50 an hour.

### Names

Graded by Claude Sonnet 5.5, blind, two repeats (the two repeats' means agree
within 0.05; one name's two grades differ by 0.2 on average). 176 human topic
segments. Relevance and specificity 1 to 5, match 0 to 2; "good" is relevance and
specificity both 4 or more.

| | live relevance | live specificity | record relevance | record specificity | record match | record good |
| --- | --- | --- | --- | --- | --- | --- |
| D0 on-device, before #123 | 1.33 | 1.16 | 1.24 | 1.12 | 0.07 | 0% |
| D1 on-device, main (#123, #124) | 1.88 | 1.47 | 1.97 | 1.57 | 0.38 | 1% |
| V0, model names on D0 | 2.24 | 2.50 | 2.22 | 2.45 | 0.48 | 3% |
| **V1, main today, gpt-5.6-luna** | **2.56** | **2.86** | **2.63** | **2.83** | **0.70** | **11%** |
| V1, gpt-6-luna | 2.33 | 2.70 | 2.56 | 2.84 | 0.72 | 13% |
| V2 turns | 2.70 | 2.52 | 2.76 | 2.73 | 0.84 | 10% |
| V3 window (2 runs) | 2.56, 2.63 | 2.44, 2.54 | 2.75, 2.83 | 2.70, 2.74 | 0.82, 0.90 | 11% |
| V4 hybrid | 3.13 | 3.02 | 3.19 | 3.08 | 1.06 | 18% |
| VF finish (2 runs) | | | 3.87, 3.63 | 3.39, 3.32 | 1.46, 1.32 | 41%, 34% |
| V3, Claude Haiku 5.5 | 3.00 | 3.15 | 2.93 | 3.19 | 0.92 | 25% |
| VF, Claude Haiku 5.5 | | | 3.55 | 3.55 | 1.27 | 45% |
| VF, Claude Sonnet 5.5 (ceiling) | | | 4.22 | 3.85 | 1.61 | 60% |

Intervals are about ±0.18 for relevance and ±0.12 for specificity (bootstrap
over segments); the full table with intervals is in the judge's output.

A second judge, gpt-6.1-sol (one repeat), scores every row 0.3 to 0.6 higher and
ranks them the same way: on-device 1.5 and 2.3 to 2.5, V0 2.8, V1 2.8 to 3.2, V2
and V3 3.2 to 3.4, V4 3.6 to 3.7, VF 3.9 (Haiku 5.5) and 4.4 (gpt-6-luna and
Sonnet 5.5). Each judge favours its own family by about 0.3: Sonnet 5.5 puts
Sonnet's VF 0.35 above gpt-6-luna's, gpt-6.1-sol puts them 0.06 apart.

- **The record's names gain the most: VF lifts relevance from 2.6 to 3.6 to 3.9
  and match from 0.70 to 1.3 to 1.5.** It names each part of the meeting from
  that part, after the fact.
- **Live, the names follow the cuts.** A name can only be as specific as the topic
  under it: V2 and V3 cut coarser than the annotators, so their live names are
  only a little better than today's. V4, which draws as many topics as the
  annotators, has the best live names.
- These scores are lower than #121's (4.75): that judge graded each name against
  its own topic's words, which rewards a broad name on a broad topic. Here a name
  is graded for each part a person marked, so a topic that spans four parts is
  graded four times against parts it does not name.

## Results: 8 far-field meetings as the app heard them (far8)

The same comparison on recognition output (WER 34.9%). One topic for the whole
meeting scores 0.356 here. Δ is paired against main today.

| | live Pk | Δ live | record Pk | Δ record | record Pk, finest | runs (annotators: 7.9) | changes drawn, after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D0, V0: before #123 | 0.388 | −0.038 [−0.133, 0.059] | 0.388 | +0.040 [−0.088, 0.167] | 0.433 | 10.6 | 36%, 0.1 min |
| **D1, V1: main today** | **0.426** | | **0.349** | | **0.371** | 5.0 | 27%, 3.4 min |
| V2 turns (3 runs) | 0.286, 0.310, 0.325 | −0.140 to −0.102, all excluding 0 | same as live | −0.063 to −0.024, none excluding 0 | 0.331 to 0.373 | 5.9 to 6.1 | 35 to 36%, 0.3 to 0.4 min |
| V3 window (3 runs) | 0.298, 0.249, 0.241 | −0.185 to −0.128, all excluding 0 | same as live | −0.107 to −0.050 | 0.319 to 0.338 | 4.6 to 7.4 | 51 to 53%, 1.0 to 1.4 min |
| V4 hybrid (3 runs) | 0.315, 0.252, 0.272 | −0.174 to −0.111, all excluding 0 | same as live | −0.096 to −0.033, none excluding 0 | 0.290 to 0.295 | 6.5 to 7.5 | 51 to 58%, 1.1 to 1.5 min |
| VF finish (3 runs) | | | 0.239, 0.328, 0.310 | −0.110 [−0.229, −0.007], then −0.020 and −0.038 (not excluding 0) | 0.286 to 0.332 | 9.8 to 12.5 | |
| V3, Claude Haiku 5.5 | 0.351 | −0.075 [−0.138, −0.024] | 0.347 | −0.002 [−0.091, 0.077] | 0.347 | 10.1 | 69%, 0.9 min |
| VF, Claude Sonnet 5.5 | | | 0.263 | −0.085 [−0.197, 0.005] | 0.252 | 9.4 | |

- **The loop survives recognition errors, and gains more.** Misheard words break
  the on-device tracker's word overlap: its live view scores 0.426, worse than one
  topic (0.356). A model reads through the errors: every live run of V2, V3 and V4
  is 0.10 to 0.19 better, each with an interval that excludes zero.
- **VF is not stable here.** The same meetings, run three times, scored 0.239,
  0.328 and 0.310 in the record: in one run it cut ES2004d into 24 topics, in
  another into 7. The requests set no temperature (as the app sends none to
  GPT-5-class models), so the model samples, and a cut of the whole meeting at
  once swings with it. A cap on topics by length
  would bound the bad cases.
- **Names hold up too** (55 human segments, same judge): record names score 3.99
  with VF (3.83 and 3.58 in the two runs whose cuts were poor) against 2.57 for today's app (Sonnet 5.5's VF: 4.22),
  and live names 2.92 with V4, 2.68 with V3, 2.54 with V2 against 2.28. The
  on-device names score 1.75 to 1.89.

### Models on this computer

Local models keep every word on the Mac, so they need no change to the privacy
rule. The ones that fit this test's 2 GB download limit are not good enough:

| far8, Qwen3.5 2B on this Mac | live Pk | record Pk | runs (annotators: 7.9) | latency p50 / p95 | failed or malformed |
| --- | --- | --- | --- | --- | --- |
| main today (V1) | 0.426 | 0.349 | 5.0 | | |
| V1 names from Qwen3.5 2B | 0.426 | 0.349 | 5.0 | 0.7 / 0.9 s | 28% of names refused |
| V3 window | 0.368 | 0.368 | 1.3 (hardly cuts) | 2.9 / 4.2 s | 0.3% |
| V4 hybrid | 0.556 | 0.556 | 15.1 (takes every proposal) | 1.6 / 3.6 s | 18% |
| VF finish | | 0.349 | 3.8 | 13.2 / 63.1 s | 25% (timed out at 120 s) |

One topic for the whole meeting scores 0.356 here: a 2 B model either does not
cut, or cuts at every proposal.

- **Alex's conversation of 2026-10-24** (28 minutes, 146 transcribed lines; read
  only by models on this Mac; its topic names went to Alex only). Main's tracker
  finds 3 topics. Qwen3.5 2B: V3 never cut it (one topic, 2.8 s a request, p95
  7.0 s); V4 found 4 topics (1.2 s, p95 3.2 s); VF 2 topics (8.5 s). LFM2.5 1.2B:
  V3 3 topics (2.5 s, p95 5.8 s); V4 5 topics, three of them on one subject; VF 5
  topics (16 s). #121's name check refused 44 to 57% of both models' names.
- They answer one request at a time on the GPU that transcribes the room. The
  app already keeps transcription first (partials run only when Whisper is idle);
  a loop of 50 to 200 requests an hour at 1 to 10 s each would compete with it.
- The app's recommended local writing models (Qwen3.5 4B and 9B, Gemma 4 E4B,
  2.7 to 5.5 GB) were not measured. They are the next thing to measure before
  the loop or VF is offered for models on this computer.

### Cost and latency

Per hour of conversation, gpt-6-luna with `reasoning: none`, list prices.

| | requests | input tokens | output tokens | dollars | latency p50 | latency p95 | failed | malformed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V1 (names only) | 25 | 17,100 | 220 | $0.0018 | 1.0 s | 1.4 s | 0% | 14% (2.7% with gpt-5.6-luna) |
| V2 turns | 198 | 221,000 | 6,000 | $0.025 | 1.1 s | 1.9 s | 0% | 0.1% |
| V3 window | 87 | 117,000 | 2,700 | $0.013 | 1.0 to 1.1 s | 1.7 to 2.0 s | 0% | 0.5% |
| V4 hybrid | 48 | 58,000 | 1,500 | $0.0067 | 1.2 s | 1.8 to 2.1 s | 0% | 0.5% |
| VF finish | 2 (one per meeting) | 12,500 | 790 | $0.0016 | 4.5 s | 7.2 s | 0% | 0% |

Other models, per hour: V3 with gpt-5.6-luna $0.027 (1.0 s p50, 1.7 s p95),
with Claude Haiku 5.5 $0.023, with Claude Sonnet 5.5 $0.50 (1.7 s p50); VF with
gpt-5.6-luna $0.0036, with Haiku 5.5 $0.0028, with Sonnet 5.5 $0.050.
OpenAI caches a prompt prefix over 1,024 tokens; these prompts are shorter, so
nothing was cached except VF's longest transcripts.

Name changes per hour while recording: main today shows the on-device name first
and changes it 6.9 times an hour as #124's re-ranking moves, then the model's
first name (9.8 an hour) and renames 1 to 2 times an hour. V2 and V3 topics
appear with the model's name and are renamed 0 to 0.1 times an hour (a rename
needs the topic to have doubled since its name); V4 renames once an hour and shows
the on-device name until its first check.

V1's 14% malformed with gpt-6-luna is the app's own name check (#121) refusing
six-word names: gpt-6-luna often answers with six words ("How remote controls
transmit button signals"), gpt-5.6-luna stays within five.

## Track 2: repairing recognition errors with a fast model

`scripts/asr-repair-eval.mjs` sends each segment of the far8 recognition output
(2,897 segments, 4 hours), in order, with the three segments before it as context,
and asks the model to fix only clear recognition errors: change a word only when
it is misheard and the right word is clear, add nothing, drop nothing, keep filler
and false starts, and return the segment unchanged when unsure. A guard keeps an
answer only when it changed at most a third of the segment's words.

Word error rate is scored as `room-replay.js` (#122) scores it (Whisper's English
normalization, one alignment per meeting); the "before" here reproduces its
34.9% exactly. Per segment, the reference is the words said inside the
segment's time. "Invented" counts words in the answer that were neither heard
nor said within a second of the segment.

| model | WER before | after | Δ per meeting [95%] | segments changed | better | worse | words invented per 1,000 | latency p50 / p95 | $ per hour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-luna | 34.9% | 34.7% | −0.18 [−0.23, −0.13] | 10.1% | 3.1% | 1.4% | 4.0 | 1.1 / 1.8 s | $0.027 |
| gpt-5.6-luna | 34.9% | 34.7% | −0.20 [−0.33, −0.05] | 11.1% | 3.7% | 1.8% | 7.5 | 1.1 / 1.6 s | $0.058 |
| Claude Haiku 5.5 | 34.9% | 34.9% | +0.01 [−0.05, 0.09] | 8.1% | 2.2% | 2.2% | 6.8 | 1.1 / 1.8 s | $0.047 |
| Claude Sonnet 5.5 (2 meetings, 28.1% before) | 28.1% | 27.8% | −0.28 [−0.34, −0.21] | 8.8% | 4.1% | 1.2% | 3.7 | 1.4 / 2.1 s | $0.93 |
| Qwen3.5 2B on this Mac (the same 2 meetings) | 28.1% | 30.2% (guarded 28.2%) | +2.11 [+1.93, +2.30] (guarded +0.19) | 9.0% | 0.6% | 4.7% | 20.3 (guarded 2.3) | 0.9 / 2.1 s | $0 |

**No.** The best fast model lowers the error rate by 0.2 points of 34.9 (0.5% of
the errors) and makes one segment in 70 worse. Even Sonnet 5.5 fixes 0.3 points.
The errors are mostly words never heard: 7,061 deletions against 4,807
substitutions and 586 insertions (#122's count), and text cannot bring back a word
the recognizer did not hear. The model's own additions (4 to 7.5 words in 1,000
that were never said) are the same order as the words it fixes. For the API models
the guard reverted 0.1 to 0.3% of answers and moved the error rate by at most
0.04 points: their edits are already small. The 2 B model on this Mac makes the
transcript worse (2.1 points, 20 invented words in 1,000), and the guard is what
holds it to +0.2.

## Proposal (for Alex to decide)

### 1. The record's topics from the writing model at Finish (VF)

- **What.** At Finish, beside the summary, the writing model gets the transcript
  as numbered lines (14 to 45 words each; at most 9,000 words a request, a longer
  conversation in parts, each with the topics found before it) and answers topic
  segments, each with a name and a one-line gist. Runs under 60 words fold into the
  topic around them. The record's topics come from this answer; the on-device
  final cut stays as the fallback when the request fails or the answer is unusable
  (0 of 75 requests on eval24 with gpt-6-luna).
- **Gains (eval24).** Record names: relevance 2.63 to 3.6 to 3.9, match 0.70 to
  1.3 to 1.5. Record Pk: 0.331 to 0.24 (paired Δ −0.09 [−0.16, −0.02]); finest
  level 0.373 to 0.25.
- **Cost.** One request: about 12,500 input and 800 output tokens per hour of
  conversation. $0.0016 an hour with gpt-6-luna, $0.0028 with Claude Haiku 5.5,
  $0.050 with Claude Sonnet 5.5. 4 to 5.5 s (p50), 6 to 10 s (p95). A provider
  answers it beside the summary; a model on this computer after it.
- **Risks.** It cuts finer than AMI's top level (10 topics where the annotators
  drew 8; twice as many in 5 of 24 meetings), and on the 12 tuning meetings it was
  not better at the top level. Each model has its own granularity (Haiku 5.5: 12
  topics). If that is too many lanes, cap the count by length (for example one
  topic per 3 minutes) rather than tune the prompt per model.
- **Privacy: needs your yes.** No new destination and no new data: the summary
  already sends the same transcript to the same model at the same moment. But the
  topic paragraph of `docs/network-allowlist.md` must change, for example: "At
  Finish, as for the summary, the model also reads the transcript once to cut the
  record into topics."
- **Where.** A pure `src/helpers/topicRecordCut.mjs` (prompt, answer check, the
  60-word rule, the snapshot) from `scripts/lib/topic-loop-variants.mjs`
  (`cutRecord`), called from `topicNamingRunner.nameFinalTopics` before the final
  naming pass. Each record topic keeps the live id of the live topic it overlaps
  most, so names and the lanes carry over; a topic that splits off gets a new id,
  as #123's re-cut at Finish already does.

### 2. Live topics with a fast model in the loop (V4 first, V2 for the fastest view)

- **What.** V4: the on-device tracker, set to propose early, proposes a change;
  the model gets up to 22 lines around it (at most 3,000 characters) and the topic
  names, and confirms it, places it (a new topic or a return) and names it; a
  topic that ran 250 words with no proposal is checked once. 48 requests an hour.
  V2: every 12 s, the new lines, the last 10 placed lines and the topic list;
  198 requests an hour. In both, a line shows at once in the current topic, and
  the model's answer lands about a second later.
- **Gains (eval24).** Live Pk 0.356 to 0.27 to 0.29 (V4) or 0.25 to 0.27 (V2). A
  real change drawn after 1.3 min (V4) or 0.4 min (V2) instead of 3.9. Live names
  2.56 to 3.13 (V4) or 2.70 (V2). V2 moves about one line older than 30 s an
  hour (main moves 206; 429 on the far-field meetings).
- **Needs a fast model, not a setting.** The writing model is often a slow or
  dear one (V3 with Claude Sonnet 5.5: $0.50 an hour, 1.7 s a request), and only
  OpenAI's small models help. So Oats would pick the provider's measured fast
  model, with no new setting: with an OpenAI key, gpt-5.6-luna (in the app's
  list; V3 with it: live Pk 0.279, paired −0.077 [−0.125, −0.030], $0.027 an
  hour) or gpt-6-luna. For every other provider and for models on this computer
  the loop stays off, and topics stay as today (on-device, named by #121).
- **Privacy: needs your yes.** During the conversation the provider gets the
  conversation as it happens: V2 every line, in 12 s batches; V4 up to 3,000
  characters around each proposed change of subject and once per 250 words of a
  long topic, which is close to today's rule but about two topics, not one.
- **Cost.** $0.007 an hour (V4) or $0.025 (V2) with gpt-6-luna; gpt-5.6-luna costs
  about twice that.
- **On this computer.** Nothing would leave, but the models that fit the 2 GB
  limit of this test (1 to 2 B) are not good enough, take 3 to 10 s a request
  and would share the GPU with live transcription. The app's recommended local
  writing models (4 to 9 B) were not measured.

### What not to do

- Do not run the loop on the writing model as it is: it is good only when the
  writing model is one of OpenAI's small models, and expensive when it is a
  large one.
- Do not repair the transcript with a text model (Track 2).
- Do not use reasoning for any of these requests: it is 2.5 times slower at the
  median, up to 5 times at p95, and no better.

## Six-word names (#121)

#121's prompt asks for 2 to 5 words, and its check refused a name of six. Its
naming requests and the answers, from eval24 V1 runs (`nameAnswers` in
`topic-loop-eval.mjs`'s JSON); the Claude models got gpt-6-luna's prompts again
(`scripts/topic-name-lengths.mjs --replay`):

| model | answers | kept at 5 words | kept at 6 words | six-word names |
| --- | --- | --- | --- | --- |
| gpt-6-luna | 337 | 81.0% | 92.9% | 40 |
| gpt-5.6-luna | 333 | 95.5% | 99.4% | 13 |
| Claude Haiku 5.5 | 337 | 94.1% | 98.8% | 16 |
| Claude Sonnet 5.5 | 337 | 92.3% | 97.6% | 18 |

A blind judge (Claude Sonnet 5.5, twice each, 1 to 5 against what was said;
`--judge`) scored the 53 six-word names relevance 3.78 [3.63, 3.92] and
specificity 3.51 [3.39, 3.63], and 60 accepted names of 2 to 5 words 3.62
[3.47, 3.76] and 2.94 [2.83, 3.06]. A six-word name is as relevant and more
specific, so the check
keeps it now (`MAX_NAME_WORDS` 6, `src/helpers/topicNaming.mjs`), for every
writing model; the prompt still asks for 2 to 5 words, and the 48-character
limit the lanes and the graph are drawn for stays. Of the names still refused,
22 of 24 (gpt-6-luna) and 2 of 2 (gpt-5.6-luna) have seven words or more.

## Other findings

- **The app's Anthropic route fails for three models in its own list.** It
  always sends `temperature` (0.3 when unset), and claude-sonnet-5,
  claude-fable-5 and claude-opus-4-8 answer HTTP 400 "`temperature` is deprecated
  for this model" (measured 2026-10-26; claude-sonnet-4-6 and claude-haiku-4-5
  answer). A summary, a topic name or a group sort with one of them fails.
- **gpt-4.1-nano, in the app's OpenAI list, is retired** (HTTP 404).
- **#121's name check refuses 14% of gpt-6-luna's names** (six words, against a
  limit of five); gpt-5.6-luna's are refused 2.7% of the time. Fixed: a
  six-word name is kept now (see "Six-word names" above).
- **On eval24 the two on-device trackers segment about equally** (main's live Pk
  0.356 against 0.339 before #123, record 0.331 against 0.339; neither difference
  is outside its interval), and main's live view scores worse than one topic for
  the whole meeting (0.345), because it draws cuts minutes late. #123's gains were
  measured on other meeting sets. Its names, with #124, are much better than
  before (relevance 1.97 against 1.24).

## Reproduce

Keys come from the environment only (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`AWS_BEARER_TOKEN_BEDROCK`) and are never written. Every request's tokens and cost
go to a ledger (`FM_LEDGER`, default `~/.cache/oats/fast-models/ledger.jsonl`), and
no request is sent past `FM_BUDGET_USD` (default 20).

```sh
AMI=~/oats-asr-cache/AMI            # holds annotations/ (ami_public_manual_1.6.2)
git show bff2230:src/helpers/conversationTopics.mjs > /tmp/v0-tracker.mjs

# Baselines (free) and today's app
node scripts/topic-loop-eval.mjs --variant d1 --vectors --ami $AMI --set eval24 --json d1.json
node scripts/topic-loop-eval.mjs --variant v1 --vectors --model openai:gpt-5.6-luna@none --ami $AMI --set eval24 --json v1.json
node scripts/topic-loop-eval.mjs --variant v0 --tracker /tmp/v0-tracker.mjs --model openai:gpt-6-luna@none --ami $AMI --set eval24 --json v0.json

# The loops and the record cut (v2, v3, v4, vf)
node scripts/topic-loop-eval.mjs --variant v3 --model openai:gpt-6-luna@none --ami $AMI --set eval24 --json v3.json

# V4 as the app ships it (helpers/topicLoop.mjs); the 30 s rule off with the option
node scripts/topic-loop-eval.mjs --variant v4app --vectors --model openai:gpt-6-luna@none --ami $AMI --set eval24 --json v4app.json
node scripts/topic-loop-eval.mjs --variant v4app --vectors --model openai:gpt-6-luna@none --ami $AMI --set eval24 \
  --options '{"loop":{"moveHorizonMs":1e12}}' --json v4app-no-rule.json

# The same on the far-field recognition output of scripts/room-replay.js (#122)
node scripts/topic-loop-eval.mjs --variant v2 --model openai:gpt-6-luna@none --ami $AMI --asr room-replay.json --json v2-far.json

# A model on this computer (llama-server, as the app runs it)
node scripts/topic-loop-eval.mjs --variant v3 --model local:qwen3.5-2b@grammar \
  --local-model Qwen_Qwen3.5-2B-Q4_K_M.gguf --llama-server resources/bin/llama-server-darwin-arm64 \
  --ami $AMI --set test --json v3-local.json

# Six-word names: refusals by length, the same prompts to other models, and the blind judge
node scripts/topic-name-lengths.mjs --runs v1.json --replay anthropic:claude-haiku-5-5 --judge anthropic:claude-sonnet-5-5

# The blind judge over any set of runs (cached per name, so added runs cost only their new names)
node scripts/topic-names-judge.mjs --runs d1.json,v1.json,v3.json --judge anthropic:claude-sonnet-5-5 --repeats 2 --json judge.json

# Track 2
node scripts/asr-repair-eval.mjs --replay room-replay.json --ami $AMI --model openai:gpt-6-luna@none --json repair.json
```

A model is `provider:model[@options]`: `@none`, `@minimal`, `@low` set OpenAI's
reasoning effort; `@grammar` constrains a local model's answer to the JSON
schema; `@us-west-2` picks a Bedrock region. `--set` is `eval24`, `test` (the 12
standard test meetings) or `all`; `--meetings` lists meetings. A stored note's
transcript (`--transcript`) is read only by models on this computer, and only
counts are printed unless `--show-labels`.

Spend for everything on this page, screening, judges and Track 2 included:
$17.89 of API calls (OpenAI $8.81, Anthropic $8.03, Bedrock $1.05), all on public AMI
data. The models on this computer cost nothing.
