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

## Frozen before eval24 (2026-11-20 22:55 PST)

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
```
