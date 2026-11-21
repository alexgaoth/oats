# Early topic proposals: a grey mark before the line

Alex, 2026-11-20: "45s is too long. Flickering might be an issue, but just hard cap the potential, uncertain topic changes. ... 10 second of course is an arbitrary value, so find the best one."

Today the change detector (`src/helpers/topicChange.mjs`) draws a new topic about a minute after the subject changed. It reads a pause only after 45 s of the talk that follows it. Then it holds the pause for 15 s more, in case a stronger pause comes. This page measures a second layer that shows the change earlier as a grey mark ("maybe"), with a hard cap on uncertain marks. The marks follow four rules:

- A mark shows when the pause's score passes a threshold after only r s of following talk. The score is read at the end of each slice of s seconds.
- At most `cap` marks are open at a time. A mark never moves.
- A mark turns solid when the detector draws a cut within 20 s of it.
- A mark fades 65 s after its pause when the detector draws no cut there.

## Method

- **Harness:** `scripts/topic-early-eval.mjs`. It replays manual AMI words, cut as the app cuts speech (0.4 s pauses, 20 s at most). It runs the app's own detector live, with the same features and trees. Turns arrive at their end, and vectors at once.
- **Scores for the early read:** two kinds.
  - The shipped trees on features whose far side is cut to r s (`gapFeatures(..., { lag: r })`).
  - Trees learned for an r s read (`scripts/topic-early-train.py`). These use the same features, labels and settings as `scripts/topic-change-train.py`, on AMI learn83 and ICSI. Each meeting is scored by the fold that held its group out.
- **Real changes:** AMI's top-level topic changes. A mark is right when a real change is within 60 s of it, as in `docs/topic-split.md`.
- **Split:**
  - Every rule is chosen on learn83, the 83 tuning meetings whose series eval24 does not hold.
  - eval24 is read once, for the frozen rule.
  - The shipped trees saw learn83 when they were trained. So on learn83 their full-read results are optimistic, and the out-of-fold early trees are the fair comparison.

## Results on learn83 (83 meetings, 42.3 h, 559 real changes)

**Today, the solid line only:**

- 7.0 cuts an hour.
- 75% of cuts are within 60 s of a real change.
- 49% of real changes are found.
- A cut is drawn a median 67 s after the change.

**Grey marks from the shipped trees, at most 2 marks faded an hour:**

| slice | r          | threshold | cap | grey/h | faded/h | turn solid | grey right | solid cuts with an earlier grey | first mark | lead |
| ----- | ---------- | --------- | --- | ------ | ------- | ---------- | ---------- | ------------------------------- | ---------- | ---- |
| 10 s  | 20         | 0.50      | 1   | 2.1    | 1.4     | 31%        | 80%        | 24%                             | 57 s       | 39 s |
| 15 s  | 15 then 30 | 0.50      | 1   | 3.0    | 1.9     | 38%        | 79%        | 37%                             | 49 s       | 42 s |
| 20 s  | 30         | 0.45      | 1   | 3.5    | 1.7     | 51%        | 86%        | 48%                             | 50 s       | 21 s |
| 30 s  | 30         | 0.45      | 1   | 3.4    | 1.5     | 56%        | 86%        | 45%                             | 52 s       | 20 s |

Column meanings:

- **first mark:** the median delay from the real change to the first mark near it, grey or solid, for the changes that the line finds. Today this is 67 s.
- **lead:** how long a grey mark shows before its solid line.

Findings:

- **The grey marks are mostly right.** 76% to 87% of them are within 60 s of a real change, against 75% for today's solid cuts.
- **Many right marks fade.** The detector draws no line at those changes, so it is too careful there. An approver (a model, or the person) could keep them.
- **A cap of 1 or 2 makes almost no difference.** Marks seldom overlap. Keep the cap at 1.

### Out-of-fold check (fair on learn83)

The shipped trees saw learn83. Two fair versions, each scored only by trees that did not see the meeting's group:

- Full-read trees (lag 45, as the app reads) applied to the short reads. At most 2 faded an hour, best: 15 s slices, r 30, threshold 0.45, cap 1. That gives 3.4 grey an hour, 1.9 faded an hour, 82% of the grey marks right, and 43% of solid cuts with an earlier grey. The first mark comes a median 51 s after the change, with a lead of 24 s.
- Trees learned for each short read: no better. Best at the same budget: 37% of solid cuts with an earlier grey, first mark at 52 s.
- Cue-gated marks, read early only where the turn opens with "next", "moving on", "let's talk about" and the like: no better at 2 faded an hour.

So the app needs no new trees. The shipped trees read a far side cut to 30 s.

## Frozen before eval24 (2026-11-20 22:39 PST; the eval24 run ended at 22:40)

The rules:

- **Primary rule:** 15 s slices, r 30, threshold 0.45, cap 1.
- **Second rule:** 15 s slices, r 15 then 30, threshold 0.50, cap 1. It shows earlier, on fewer cuts.

The bar for showing grey marks (proposed). Each item is read on eval24 with the shipped trees, which did not see eval24:

1. At most 2 faded marks an hour.
2. At least 75% of grey marks are within 60 s of a real change, which is the precision of today's solid line on learn83.
3. Marks show earlier than the line, with a 95% meeting-bootstrap interval that excludes 0.

## Results on eval24 (read once, 24 meetings, 12.7 h, 168 real changes)

Today, the solid line only: 7.2 cuts an hour, 63% within 60 s of a real change, 44% of real changes found, drawn a median 65 s after the change.

| Frozen rule                             | faded/h        | grey right        | solid cuts with an earlier grey | seconds earlier than the line (mean over found changes) |
| --------------------------------------- | -------------- | ----------------- | ------------------------------- | ------------------------------------------------------- |
| Primary: 15 s, r 30, 0.45, cap 1        | 2.1 [1.3, 3.1] | 0.75 [0.60, 0.89] | 0.46 [0.28, 0.63]               | 14.6 [9.1, 20.2]                                        |
| Second: 15 s, r 15 then 30, 0.50, cap 1 | 2.3 [1.5, 3.2] | 0.69 [0.57, 0.82] | 0.45 [0.26, 0.64]               | 17.0 [9.8, 24.7]                                        |

The intervals are 95%, by bootstrap over meetings.

### Shared app and replay rule

The replay now uses `src/helpers/topicProposals.mjs`. The grid result files
matched the original replay byte for byte on learn83 and eval24 for the
15 s slice, 0.45 threshold and one open mark. The frozen-rule results and
their intervals also matched for both rules.

| Set     | Primary rule fades/h | Grey right | Solid cuts with an earlier grey | Mean lead over found changes |
| ------- | -------------------: | ---------: | ------------------------------: | ----------------------------: |
| learn83 | 2.1                  | 87%        | 48%                             | 14.5 s                        |
| eval24  | 2.1                  | 75%        | 46%                             | 14.6 s                        |

Against the bar:

1. **Faded marks:** 2.1 an hour against a bar of 2. The interval holds 2: met at the edge.
2. **Precision:** 75%, which meets the bar. It is higher than today's solid line on eval24 (63%).
3. **Earlier:** the gain interval [9.1, 20.2] s excludes 0, so the marks show earlier: met.

What a person sees with the primary rule:

- About 3 grey marks an hour.
- About half of the new topics get a grey mark 20 to 30 s before the line.
- About 2 marks an hour fade.

The gain is real, but small: about 15 s on average. The shipped trees cannot see a change sooner. Below 30 s of the following talk they are not sure enough. To go faster, a stronger judge must approve the grey marks early. That is the next study: a model reads about 15 s after a candidate pause and says whether the subject changed.

### Rolling fade cap, added after the eval24 read

The app does not open a mark when three marks faded in the last 60 minutes
of the current conversation. Solid marks do not count. This is a limit on
bursts, not a new fit to eval24. The opening rule stays frozen.

| Set | Measure | Frozen | With cap | Paired change [95% interval] |
| --- | --- | ---: | ---: | ---: |
| learn83 | Fades per hour | 2.056 | 1.961 | −0.095 [−0.216, 0] |
| learn83 | Grey marks right | 87.2% | 86.8% | −0.4 points [−0.9, 0] |
| learn83 | Solid cuts with an earlier grey | 48.0% | 47.3% | −0.7 points [−2.0, 0] |
| learn83 | Mean lead over found changes | 14.458 s | 14.263 s | −0.195 s [−0.541, 0] |
| eval24 | Fades per hour | 2.134 | 2.055 | −0.079 [−0.269, 0] |
| eval24 | Grey marks right | 75.0% | 74.4% | −0.6 points [−2.3, 0] |
| eval24 | Solid cuts with an earlier grey | 45.9% | 45.9% | 0 points [0, 0] |
| eval24 | Mean lead over found changes | 14.589 s | 14.589 s | 0 s [0, 0] |

The paired intervals resample meetings and all include zero. On eval24,
the cap removes one fade and leaves the lead unchanged. The capped
precision is just below 75%, and the fade rate is just above two per hour.

## Part 2: early cuts and the grey band

The English in-room detector reads the shipped trees on 15 seconds of following
speech. A score of 0.45 or higher commits a solid cut when the final turns and
their vectors arrive. The cut counts toward the 90 s spacing and 20 s exclusion.
The ordinary 45 s read and 15 s hold still catch slower changes.

Every 15 s, the strongest eligible score in [0.40, 0.45) can open one grey mark.
A detector cut within 20 s settles the mark. A 30 s reread at 0.45 or higher also
settles it and commits a cut. A mark that opens with the reread already available
gets that reread on the next event. Unsettled marks fade at 65 s from the pause.
After three fades in a rolling hour, no new grey mark opens until the oldest
fade leaves that hour. High scores still commit cuts.

The optional judge is off by default (`topicProposalJudgeEnabled`). On a
supported key route, it uses the existing provider's check model. It asks once
per open mark, with finalized turns starting in the 90 s before and 15 s after
the pause. A yes with confidence of 0.80 or higher can commit the cut only while
the same mark is open. Neither live model loop changes. When a loop owns the
live view, its topic cuts still take precedence over this detector's view.

### learn83: floor selection

The tuning sweep without a judge gave 5.766, 5.411 and 3.450 fades per hour at
floors of 0.30, 0.35 and 0.40. We chose 0.40 for the fewest fades and froze it
at **2026-11-20 23:09:41 PST**, before the eval24 run. Pooled rates divide the
total by meeting hours. They can exceed three even when no single recording
exceeds three fades in a rolling hour.

After the holdout run, we scheduled fades at the precise deadline, rejected
detector settlements at or after the deadline, and sorted cached verdicts by
delivery time. With no other tuning, we checked those corrections on learn83:

| Grey floor | Cuts/h | Precision | Found | Median delay | Grey/h | Fades/h | Settled | Grey right |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 7.02 | 74.75% | 49.19% | 67.45 s | — | — | — | — |
| 0.30 | 8.65 | 71.58% | 57.78% | 25.42 s | 6.569 | 5.766 | 12.2% | 61.2% |
| 0.35 | 8.65 | 71.31% | 57.60% | 25.49 s | 6.167 | 5.411 | 12.3% | 65.1% |
| 0.40 | 8.67 | 71.39% | 57.78% | 25.55 s | 4.490 | 3.639 | 18.9% | 60.0% |
| 0.40 + cached Luna | 9.12 | 70.73% | 59.75% | 24.45 s | 4.726 | 2.954 | 37.5% | 60.0% |

The corrected default rule leads the baseline by 28.47 s [25.26, 31.65]
where both find the change. Cached Luna leads by 32.10 s [28.03, 35.56].

### eval24: the single frozen read

These are the original results, before the deadline and verdict-order
corrections. We did not read eval24 again. This measures the integrated
local detector with immediate vectors, not either writing-model loop or
recognition latency. Matches use AMI topic changes within 60 seconds.

| Variant | Cuts/h | Precision | Found | Median delay | Grey/h | Fades/h | Settled | Grey right |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 s read and hold | 7.19 | 62.64% | 44.05% | 65.23 s | — | — | — | — |
| Two bands, no judge | 8.53 | 63.89% | 53.57% | 34.44 s | 4.109 | 2.687 | 34.6% | 48.1% |
| Two bands, cached Luna | 9.25 | 59.83% | 54.76% | 29.72 s | 4.425 | 2.055 | 53.6% | 48.2% |

Paired 95% intervals resample whole meetings:

| Change against baseline | No judge | Cached Luna |
| --- | ---: | ---: |
| Precision, percentage points | +1.25 [−1.91, +4.51] | −2.81 [−6.40, +1.04] |
| Found, percentage points | +9.52 [+4.76, +15.19] | +10.71 [+6.06, +16.25] |
| Mean lead where both find the change | 20.38 s [12.01, 28.69] | 24.81 s [17.67, 31.21] |

The no-judge median fell by 30.79 s [16.53, 42.70]. The frozen no-judge rule met
all three bars: precision within three points of baseline, no more than three
pooled fades per hour, and a lead interval that excludes zero. Its cuts came
from 57 early reads, 47 ordinary reads and four rereads.

The Luna replay matched all 56 opened marks to cached verdicts. Luna settled 20
marks by verdict. The cached replay does not measure the check model that a
particular key selects at runtime. This lane made no cloud calls.

### Prior approver study

In the separate orchestrator study, the 15 s early cut alone gained 1.2 points
of precision [−2.5, +5.0] and 11.3 points found [+5.5, +17.5]. It led by 25.7 s
[17.3, 35.1] on shared hits, with a 26 s median against 65 s. At a 0.35 floor,
Luna (`gpt-6-luna`, no reasoning) gained 13.1 points found and had a 19 s median.
It took about 0.6 s and cost about $0.00007 per request.

Gemma 4 E4B approved 90% of candidates on learn83. It improved by about two
points over approving everything. The judge does not use Gemma.

## Part 3: who draws the live line (learn83, 2026-11-21)

Today a writing model on this Mac that may run during a recording turns on the window loop (`src/helpers/topicWindowLoop.mjs`). The loop cuts the last 6 minutes again every 2 minutes, and its view replaces the detector's live view. So its users never see the early cut. The proposal: every route cuts with the detector and the early cut, and the model only names each topic when its cut lands (`src/helpers/topicNamer.mjs`).

- **Harness:** `scripts/topic-loop-eval.mjs`, with the live line metrics below. It replays the manual AMI words of the 83 learn83 meetings: 41.5 h from first to last speech, 559 real changes, 13.5 an hour.
- **Model:** Gemma 4 E4B (Q4_K_M) through `llama-server` on this Mac, in all three arms. No cloud calls. eval24 was not read.
- **Arms:** `v3` is the experiment's loop with the shipped window settings (2 min stride, 6 min window, 100 lines, 1,500 words). `v3app` is the shipped class (`WindowTopicLoop`). `v1` is the detector with the early cut, and the namer names each topic.
- **Line metrics:** each boundary counts once, at its first display, also when a later window removes it. A line is right when a real change is within 60 s of it. A real change is found when any line is within 60 s of it. This match is not one to one.

| Route | Lines an hour | Right within 60 s | Found within 60 s | Median first line | Median model name, from speech |
| --- | ---: | ---: | ---: | ---: | ---: |
| Window loop (`--variant v3`) | 29.15 | 49.1% (594/1,211) | 75.1% (420/559) | 90.9 s | 105.3 s |
| Shipped window loop (`--variant v3app`) | 26.88 | 49.6% (554/1,117) | 68.7% (384/559) | 84.1 s | 94.0 s |
| Detector + early cut + namer (`--variant v1 --early-cut --vectors`) | 8.81 | 71.6% (262/366) | 57.8% (323/559) | 25.9 s | 40.3 s |

**Chance.** Random lines, with the same number in each meeting, give these expected values (a 120 s window for each line):

| Route | Right by chance | Found by chance | Right, above chance | Found, above chance |
| --- | ---: | ---: | ---: | ---: |
| Window loop | 36.3% | 61.9% | +12.8 points | +13.2 points |
| Shipped window loop | 35.2% | 57.1% | +14.3 points | +11.5 points |
| Detector + early cut | 37.9% | 27.2% | +33.7 points | +30.6 points |

**Paired differences.** The detector route minus each loop, in points. The intervals are 95% paired meeting bootstraps (10,000 draws, `scripts/topic-routing-compare.py`).

| Detector route minus | Right | Found | Right, above chance | Found, above chance |
| --- | ---: | ---: | ---: | ---: |
| Window loop | +22.5 [+17.2, +27.8] | -17.4 [-22.6, -12.2] | +20.9 [+15.8, +25.9] | +17.3 [+12.7, +22.1] |
| Shipped window loop | +22.0 [+16.5, +27.4] | -10.9 [-16.5, -5.4] | +19.3 [+14.2, +24.4] | +19.0 [+15.1, +23.1] |

**Segmentation at the live end.** Lower is better. The intervals are 95% meeting bootstraps.

| Route | Pk | WindowDiff |
| --- | ---: | ---: |
| Window loop | 0.327 [0.302, 0.353] | 0.417 [0.387, 0.450] |
| Shipped window loop | 0.331 [0.304, 0.358] | 0.405 [0.375, 0.437] |
| Detector + early cut | 0.234 [0.213, 0.256] | 0.269 [0.248, 0.292] |
| One topic for the whole meeting | 0.325 | |

**Stability, an hour.**

| Route | Old lines moved to another topic | Lines taken back | Label changes |
| --- | ---: | ---: | ---: |
| Window loop | 145.5 | 3.9 | 0.1 |
| Shipped window loop | 146.0 | 3.5 | 4.6 (2.0 first model names, 2.0 phrase-label changes, 0.6 back to a phrase label, 0.1 renames) |
| Detector + early cut | 16.5 | 0 | 19.9 (10.3 first model names, 3.0 renames, 6.6 phrase-label changes) |

On the detector route a new topic shows with its phrase label first. The model name replaces it a median 7.2 s later. On the window loops a topic shows with its model name, a median 84 to 91 s after the change. The window loop's requests took a median 2.9 s, and 8.8% of its answers were malformed. The shipped loop's requests took 2.8 s, and 6.7% were malformed. It named 647 of its 664 topics. The namer's requests took 0.8 s, and 1.4% were malformed.

Result:

- The gate in the brief failed: the detector route must not be worse on right and on found. It found 57.8% against 75.1% (`v3`) and 68.7% (`v3app`).
- Most of the window loops' lead on found comes from their line counts. Random lines at 29 an hour find 61.9%, and at 27 an hour 57.1%. Above chance, the detector route finds +30.6 points, the window loops +11.5 to +13.2.
- Both sides of the trade are real. Against the shipped loop, the detector route finds 10.9 points fewer changes [5.4, 16.5]. Above chance it finds 19.0 points more [15.1, 23.1], and its lines are right 22.0 points more often [16.5, 27.4].
- The detector route is better on every other measure here: right, first line, first name, Pk, WindowDiff and old lines moved.
- The shipped loop matches the experiment's loop on right, Pk and old lines moved. It draws 8% fewer lines and finds 6.4 points fewer changes.
- Alex decides the routing. Live routing is unchanged.

### A stricter grey (learn83 only, a proposal)

The eval24 read of the 0.40 to 0.45 band gave 48% of marks right and 2.7 faded an hour. The bar for a new rule on learn83: at least 70% right and at most 2 faded an hour. Cached MiniLM vectors, the current detector, no judge, one open mark and a 65 s deadline.

| Rule | Marks | Right | Marks an hour | Faded an hour | Settled |
| --- | ---: | ---: | ---: | ---: | ---: |
| No grey | 0 | | 0 | 0 | |
| R15, 0.400 to under 0.45 | 190 | 60.0% | 4.49 | 3.64 | 18.9% |
| R15, 0.430 to under 0.45 | 73 | 61.6% | 1.73 | 1.42 | 17.8% |
| R15, 0.440 to under 0.45 | 29 | 79.3% | 0.69 | 0.57 | 17.2% |
| R15, 0.445 to under 0.45 | 14 | 85.7% | 0.33 | 0.31 | 7.1% |
| R30 at 0.45, no early cut | 27 | 81.5% | 0.64 | 0.59 | 7.4% |

The 0.44 band meets both bars. It has 29 marks, so its interval is wide. These are tuning numbers, not a held-out result. Grey stays off by default.

## Commands

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
O=~/oats-asr-cache/topic-early
# the grid, shipped trees (learn83):
node scripts/topic-early-eval.mjs --ami ~/oats-asr-cache/AMI --set learn83 --model-dir resources/bin/all-MiniLM-L6-v2 --json $O/learn83-v1.json
# out of fold: features at each lag, then trees learned without each meeting's group:
node scripts/topic-change-features.mjs --ami ~/oats-asr-cache/AMI --meetings "$(cat $O/learn83.txt)" --lag 45 --out $O/f45/ami
node scripts/topic-change-features.mjs --icsi ~/oats-asr-cache/ICSI/nxt/ICSIplus --lag 45 --out $O/f45/icsi
# (and the same with --lag 5, 10, 15, 20, 30, AMI only, for --apply)
~/oats-asr-cache/venvs/topics/bin/python -B scripts/topic-early-train.py --data ami=$O/f45/ami --data icsi=$O/f45/icsi --out $O/oof45 --apply 30=$O/f30/ami
# eval24, once, the frozen rules:
node scripts/topic-early-eval.mjs --ami ~/oats-asr-cache/AMI --set eval24 --model-dir resources/bin/all-MiniLM-L6-v2 --slices 15 --thresholds 0.45 --caps 1 --rules "15:30:0.45:1;15:15/30:0.5:1"
# Post-read check of the cap (also run with --set learn83):
node scripts/topic-early-eval.mjs --ami ~/oats-asr-cache/AMI --set eval24 --model-dir resources/bin/all-MiniLM-L6-v2 --slices 15 --thresholds 0.45 --caps 1 --top 0 --rules "15:30:0.45:1" --compare-fade-cap
# Part 2 deadline check on learn83, with no model calls:
node scripts/topic-early-eval.mjs --ami ~/oats-asr-cache/AMI --set learn83 --lags 15,30 --bands --grey-floors 0.30,0.35,0.40 --approvals "$O/verdicts-learn83-r15.jsonl"
# Part 3 routing, heavy (local Gemma, the slot, 22:00 to 08:00):
G=~/oats-asr-cache/models/llm/gemma-4-e4b/google_gemma-4-E4B-it-Q4_K_M.gguf
L="--model local:gemma-4-e4b --local-model $G --llama-server /opt/homebrew/bin/llama-server --local-port 18473 --local-context 16384"
node scripts/topic-loop-eval.mjs --variant v3 --ami ~/oats-asr-cache/AMI --set learn83 $L --options '{"strideMs":120000,"windowMs":360000,"maxLines":100,"maxWords":1500}' --json ~/oats-asr-cache/topic-routing/learn83-v3-window.json
node scripts/topic-loop-eval.mjs --variant v3app --ami ~/oats-asr-cache/AMI --set learn83 $L --json ~/oats-asr-cache/topic-routing/learn83-v3app-window.json
node scripts/topic-loop-eval.mjs --variant v1 --early-cut --vectors --ami ~/oats-asr-cache/AMI --set learn83 $L --json ~/oats-asr-cache/topic-routing/learn83-v1-early-cut.json
# Part 3 chance values and paired differences (light, under 1 s):
R=~/oats-asr-cache/topic-routing
python3 -I scripts/topic-routing-compare.py $R/learn83-v1-early-cut.json $R/learn83-v3-window.json $R/learn83-v3app-window.json
```
