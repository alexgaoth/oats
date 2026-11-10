# Topic split: should a long topic in a narrow conversation be cut finer?

Question (Alex, 2026-11-08): topic names are a few words and do not tell topics
apart. "Maybe split topics when the scope is narrow." When a conversation stays
on one narrow subject, the change detector (#170) draws few cuts, a topic grows
long, and its name says little. This page measures how long the topics get, tries
three ways to cut them finer and one control, and gives the options. It changes
nothing by default. The names themselves (#193, a growing description for each
topic) are a separate track.

## The answer

- **Long topics are real and they are mixed.** With the detector as it ships, a
  meeting has about one topic of 10 minutes or more, and it holds 63% of the talk
  live (68% in the record). 77 of the 81 such topics on the learn meetings hold two
  or more of the annotators' fine stretches (8.4 on average). The annotators'
  own top-level topics are shorter: 0.61 a meeting over 10 minutes, 33% of the talk.
- **No rule brings the cuts closer to the fine level on the learn meetings.** No
  rule improves fine-level Pk (the best is −0.005, and no gain's interval excludes
  0), and every rule that shortens topics pays on the top level (+0.017 or more,
  each interval above 0; only the most cautious setting, +0.008, does not, and it
  barely shortens anything). What they buy is shorter topics: talk in topics of 10
  minutes or more goes from 63–68% to 39–51%.
- **The detector puts its extra cuts in good places.** Cutting the long runs into
  equal pieces of time, with no reading of the talk, costs +0.074 on the top level
  and +0.026 on the fine level. A detector rule with about the same number of
  topics costs +0.056 and −0.001. So the extra cuts are not noise; they are only
  not better than the cuts the detector already drew.
- **On eval24 (one run, after every choice was made) both rules did better than on
  the learn meetings.** The record split: top level +0.003 [−0.022, +0.028], fine
  level −0.015 [−0.029, −0.002], 5.9 topics against 4.5. The live split: top
  +0.004, fine −0.011 [−0.023, +0.000]. Talk in long topics: 68% to 44% and 52%.
- **What a person would see**: about one more topic a meeting (two an hour), the
  longest lane cut in two or three, and (live split only) 3 more name changes an hour and 8 more old
  lines moved an hour. The record split changes nothing while recording.

**Recommendation, for Alex to decide:** if long topics hurt in use, take the record
split (B below, `recordSplit: { after: 480, threshold: 0.25 }`): it costs nothing
while recording, its top-level cost was +0.023 on the learn meetings and +0.003 on
eval24, and it took the most talk out of long topics. Do not expect better
boundaries from it, only shorter topics. If the live lanes must change too, the
live split (A) is the cheaper live rule. A lower global threshold (C) is worse
than both for the same number of topics.

## Key numbers

Learn meetings (learn83, cross-fitted detectors, see Method). Long: 10 minutes or
more. Lower Pk is better. Δ is paired against the detector as it ships, with a 95%
bootstrap interval over meetings.

| | top Pk, record | Δ | fine Pk, record | Δ | topics | long a meeting | talk in long topics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| detector as it ships (d2) | 0.241 | | 0.317 | | 4.3 | 0.98 | 68% |
| A: lower bar in a long topic, live, 8 min, 0.20 | 0.257 | +0.017 [+0.004, +0.029] | 0.313 | −0.004 [−0.011, +0.003] | 5.0 | 0.86 | 51% |
| B: split at Finish, 8 min, 0.25 | 0.264 | +0.023 [+0.007, +0.039] | 0.312 | −0.005 [−0.014, +0.003] | 5.5 | 0.71 | 47% |
| C: lower threshold everywhere, 0.30 | 0.264 | +0.024 [+0.008, +0.038] | 0.323 | +0.006 [−0.003, +0.015] | 5.5 | 0.89 | 56% |
| D: subtopic trees in a long topic, live, 8 min, 0.5 | 0.249 | +0.008 [−0.001, +0.017] | 0.318 | +0.001 [−0.005, +0.007] | 4.7 | 0.94 | 58% |
| control: equal pieces of 8 min | 0.315 | +0.074 [+0.059, +0.090] | 0.343 | +0.026 [+0.016, +0.036] | 6.1 | 0.27 | 13% |
| annotators, fine level, read as topics | 0.244 | +0.004 [−0.040, +0.048] | 0 | | 13.8 | 0.27 | 13% |

eval24, one run of the shipped detector, apart from the tuning:

| eval24, record | top Pk | Δ | fine Pk | Δ | topics | long a meeting | talk in long topics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| d2 | 0.257 | | 0.333 | | 4.5 | 0.96 | 68% |
| A | 0.261 | +0.004 [−0.022, +0.029] | 0.322 | −0.011 [−0.023, +0.000] | 5.3 | 0.88 | 52% |
| B | 0.260 | +0.003 [−0.022, +0.028] | 0.318 | −0.015 [−0.029, −0.002] | 5.9 | 0.75 | 44% |

## Method

- **Meetings.** Tuning only on **learn83**: the 83 AMI meetings whose series is not in
  eval24 (`--set learn83` in `scripts/topic-loop-eval.mjs`, new here). The 24
  meetings of eval24 (the 12 standard test meetings ES2004, IS1009, TS3003 and 12
  spread tuning meetings) were read once, at the end, for d2, A and B.
- **Cross-fitted detectors.** The shipped trees learned from every learn83 meeting, so
  on them they score better than anywhere else (Pk 0.230 against 0.245, precision 79%
  against 74%). A rule that lowers a threshold would look better than it is. So the
  series of learn83 are dealt into six folds; six models are trained without one fold
  each, with the shipped settings (`scripts/topic-change-train.py`, ICSI included,
  threshold 0.3531); and each meeting is replayed with the model that did not see it
  (`scripts/topic-split-folds.mjs`). d2 cross-fitted scores 0.245 live, as round 2's
  held-out groups (0.24 to 0.25).
- **Replay.** `scripts/topic-loop-eval.mjs --variant d2 --vectors`: the app's tracker
  and detector, each turn fed as the app feeds it, MiniLM vectors from the cache. Live
  is the view at the end of the meeting; record is `snapshot({ final: true })`.
- **Scores** (`scripts/topic-split-eval.mjs`, new). Pk and WindowDiff against AMI's
  top level and its finest level (`refFine`), boundary precision and recall at both
  levels (a drawn change within a minute of a real one; at the fine level, with a fine
  change every 2.7 minutes, a minute is lenient, so read the fine P/R with care). A
  topic's length: its words, and the time of its runs (a run lasts until the next run
  starts). A long topic holds a fine stretch when most of the stretch's words are in
  it (stretches of 40 words or more). "Names changed an hour" and "old lines moved an
  hour" are the replay's live measures (`labelChangesPerHour`, `linesMovedOldPerHour`).
- **The control** (`--even 8`): each run of d2's record of 8 minutes or more is cut into
  equal pieces of time at the nearest turn. It reads nothing of the talk.

## How long the topics get (question 1)

Detector as it ships, cross-fitted, learn83 (83 meetings, 41.5 h).

| | topic minutes p50 / p75 / p90 (max) | words p50 / p75 / p90 | 5 min or more: a meeting, talk, with 2+ fine | 10 min or more: a meeting, talk, with 2+ fine |
| --- | --- | --- | --- | --- |
| d2, live | 4.6 / 9.2 / 17.1 (39) | 676 / 1487 / 2863 | 1.99, 85%, 139 of 165 | 0.98, 63%, 75 of 81 |
| d2, record | 4.2 / 9.2 / 19.6 (39) | 518 / 1402 / 3163 | 1.81, 86%, 130 of 150 | 0.98, 68%, 77 of 81 |
| annotators, top level | 2.3 / 5.6 / 9.3 (26) | 325 / 883 / 1493 | 2.24, 72%, 126 of 186 | 0.61, 33%, 38 of 51 |
| annotators, fine level | 1.3 / 2.7 / 4.8 (21) | 197 / 440 / 788 | 1.34, 38%, 12 of 111 | 0.27, 13%, 2 of 22 |

A long topic of the detector holds 8.4 fine stretches on average (record, 10 minutes
or more), against 4.7 for a long top-level topic of the annotators. Part of this is
the tracker's grouping: a topic is every stretch about the same thing, so a return
adds its runs to the topic. On eval24 the picture is the same: 0.96 long topics a
meeting, 68% of the talk in the record, 22 of 23 with two or more fine stretches.

## The rules (question 2)

Each is an option of `TopicChangeDetector` (`src/helpers/topicChange.mjs`), off unless
given, passed as the tracker's `detector` option (in the eval:
`--options '{"detector":{...}}'`).

- **A, `split: { after, threshold }`, live and record.** Once the stretch since the
  last cut has run `after` seconds, a pause is cut at `threshold` instead of 0.3531.
  The spacing (90 s) and hold (15 s) stay. Tried: after 3, 5, 8 min; threshold 0.15,
  0.20, 0.25.
- **B, `recordSplit: { after, threshold, spacing }`, record only.** At Finish, each
  stretch longer than `after` seconds is cut at its strongest pause scoring at least
  `threshold` that leaves `spacing` seconds on each side, then each half again, until
  none is left. The live view is not touched. Tried: after 5, 8, 12 min; threshold
  0.10, 0.15, 0.20, 0.25; spacing 90 s.
- **C, `threshold`, everywhere** (an existing option): 0.30, 0.25, 0.20. This is
  round 2's "the threshold is one number".
- **D, subtopic trees** (`split.model` or `recordSplit.model`, `splitModel` in the eval).
  The same 29 features and recipe, trained on where the annotators' fine level changes
  (`scripts/topic-change-features.mjs --fine`), cross-fitted the same way, read only
  inside a long topic. Tried with A's and B's rules: after 5, 8 (and 12 for B) min;
  threshold 0.3, 0.4, 0.5.

### Tuning, learn83, cross-fitted

Long: 10 minutes or more. Names changed an hour are live; B does not change the live
view, so its live columns are d2's.

#### Live

| rule | Pk top | Δ top | WD top | Pk fine | Δ fine | WD fine | topics | P / R top | P / R fine | minutes p50 / p90 | long a meeting | talk in long topics | names changed an hour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| d2 | 0.245 | | 0.273 | 0.319 | | 0.343 | 4.2 | 74% / 36% | 82% / 18% | 4.6 / 17.1 | 0.98 | 63% | 22.3 |
| A, 5 min, 0.20 | 0.278 | +0.033 [+0.017, +0.048] | 0.314 | 0.326 | +0.007 [−0.002, +0.016] | 0.356 | 5.5 | 63% / 45% | 76% / 24% | 5.0 / 10.1 | 0.58 | 30% | 26.7 |
| **A, 8 min, 0.20** | 0.263 | +0.018 [+0.005, +0.030] | 0.295 | 0.317 | −0.003 [−0.009, +0.004] | 0.343 | 5.0 | 66% / 41% | 78% / 22% | 5.0 / 11.4 | 0.78 | 39% | 24.8 |
| C, 0.30 | 0.267 | +0.022 [+0.008, +0.036] | 0.299 | 0.325 | +0.006 [−0.003, +0.014] | 0.352 | 5.5 | 65% / 46% | 75% / 24% | 3.5 / 12.1 | 0.82 | 47% | 25.2 |
| C, 0.25 | 0.295 | +0.050 [+0.029, +0.071] | 0.337 | 0.329 | +0.010 [−0.004, +0.024] | 0.361 | 6.9 | 57% / 53% | 71% / 30% | 3.0 / 9.3 | 0.58 | 33% | 27.8 |
| D live, 8 min, 0.5 | 0.253 | +0.008 [−0.001, +0.017] | 0.283 | 0.320 | +0.001 [−0.005, +0.007] | 0.346 | 4.7 | 69% / 39% | 78% / 20% | 5.0 / 13.5 | 0.89 | 48% | 23.9 |
| annotators, top level | 0 | | 0 | 0.161 | | 0.194 | 7.7 | | 100% / 45% | 2.3 / 9.3 | 0.61 | 33% | |
| annotators, fine level | 0.244 | −0.001 [−0.044, +0.044] | 0.354 | 0 | | 0 | 13.8 | 45% / 100% | | 1.3 / 4.8 | 0.27 | 13% | |

#### Record

| rule | Pk top | Δ top | WD top | Pk fine | Δ fine | WD fine | topics | P / R top | P / R fine | minutes p50 / p90 | long a meeting | talk in long topics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| d2 | 0.241 | | 0.270 | 0.317 | | 0.342 | 4.3 | 74% / 41% | 81% / 20% | 4.2 / 19.6 | 0.98 | 68% |
| **A, 8 min, 0.20** | 0.257 | +0.017 [+0.004, +0.029] | 0.291 | 0.313 | −0.004 [−0.011, +0.003] | 0.341 | 5.0 | 67% / 46% | 78% / 24% | 4.3 / 14.4 | 0.86 | 51% |
| B, 5 min, 0.20 | 0.297 | +0.056 [+0.033, +0.078] | 0.343 | 0.316 | −0.001 [−0.013, +0.010] | 0.353 | 6.7 | 56% / 57% | 72% / 33% | 3.1 / 9.9 | 0.66 | 39% |
| **B, 8 min, 0.25** | 0.264 | +0.023 [+0.007, +0.039] | 0.301 | 0.312 | −0.005 [−0.014, +0.003] | 0.342 | 5.5 | 62% / 49% | 76% / 27% | 4.0 / 12.8 | 0.71 | 47% |
| B, 12 min, 0.20 | 0.258 | +0.017 [+0.003, +0.033] | 0.291 | 0.316 | −0.001 [−0.008, +0.006] | 0.344 | 5.0 | 65% / 45% | 77% / 24% | 4.3 / 13.9 | 0.89 | 50% |
| C, 0.30 | 0.264 | +0.024 [+0.008, +0.038] | 0.297 | 0.323 | +0.006 [−0.003, +0.015] | 0.351 | 5.5 | 65% / 50% | 74% / 26% | 3.1 / 13.7 | 0.89 | 56% |
| D live, 8 min, 0.5 | 0.249 | +0.008 [−0.001, +0.017] | 0.280 | 0.318 | +0.001 [−0.005, +0.007] | 0.344 | 4.7 | 70% / 43% | 78% / 22% | 4.2 / 16.2 | 0.94 | 58% |
| D at Finish, 8 min, 0.5 | 0.254 | +0.013 [−0.002, +0.029] | 0.287 | 0.317 | +0.000 [−0.009, +0.010] | 0.345 | 5.0 | 67% / 46% | 77% / 24% | 4.0 / 16.0 | 0.80 | 53% |
| control: equal pieces, 8 min | 0.315 | +0.074 [+0.059, +0.090] | 0.350 | 0.343 | +0.026 [+0.016, +0.036] | 0.371 | 6.1 | 57% / 47% | 73% / 27% | 5.2 / 7.7 | 0.27 | 13% |

#### Every setting, record

| rule | Δ top | Δ fine | topics | long a meeting | talk in long topics |
| --- | --- | --- | --- | --- | --- |
| C 0.30 / 0.25 / 0.20 | +0.024 / +0.051 / +0.078 | +0.006 / +0.010 / +0.021 | 5.5 / 6.8 / 8.0 | 0.89 / 0.81 / 0.66 | 56% / 50% / 41% |
| A 3 min, 0.15 / 0.20 / 0.25 | +0.085 / +0.056 / +0.040 | +0.014 / +0.013 / +0.009 | 6.9 / 6.3 / 5.6 | 0.54 / 0.71 / 0.71 | 29% / 41% / 46% |
| A 5 min, 0.15 / 0.20 / 0.25 | +0.055 / +0.033 / +0.029 | +0.010 / +0.007 / +0.005 | 5.8 / 5.5 / 5.2 | 0.66 / 0.66 / 0.75 | 38% / 41% / 47% |
| A 8 min, 0.15 / 0.20 / 0.25 | +0.020 / +0.017 / +0.017 | −0.002 / −0.004 / −0.002 | 5.1 / 5.0 / 4.9 | 0.82 / 0.86 / 0.89 | 48% / 51% / 54% |
| B 5 min, 0.10 / 0.15 / 0.20 / 0.25 | +0.113 / +0.081 / +0.056 / +0.035 | +0.010 / +0.003 / −0.001 / −0.005 | 8.0 / 7.4 / 6.7 / 5.9 | 0.48 / 0.61 / 0.66 / 0.73 | 24% / 32% / 39% / 47% |
| B 8 min, 0.10 / 0.15 / 0.20 / 0.25 | +0.047 / +0.039 / +0.030 / +0.023 | −0.004 / −0.004 / −0.003 / −0.005 | 6.4 / 6.2 / 5.8 / 5.5 | 0.58 / 0.67 / 0.72 / 0.71 | 31% / 37% / 44% / 47% |
| B 12 min, 0.10 / 0.15 / 0.20 / 0.25 | +0.026 / +0.023 / +0.017 / +0.018 | −0.002 / −0.001 / −0.001 / −0.001 | 5.2 / 5.1 / 5.0 / 4.9 | 0.87 / 0.89 / 0.89 / 0.88 | 47% / 49% / 50% / 52% |
| D live 5 min, 0.3 / 0.4 / 0.5 | +0.085 / +0.042 / +0.010 | +0.021 / +0.005 / +0.001 | 6.0 / 5.5 / 4.8 | 0.61 / 0.71 / 0.84 | 34% / 42% / 54% |
| D live 8 min, 0.3 / 0.4 / 0.5 | +0.039 / +0.021 / +0.008 | +0.004 / +0.001 / +0.001 | 5.2 / 5.0 / 4.7 | 0.80 / 0.87 / 0.94 | 45% / 51% / 58% |
| D at Finish 5 min, 0.3 / 0.4 / 0.5 | +0.121 / +0.072 / +0.017 | +0.023 / +0.011 / +0.004 | 7.9 / 6.6 / 5.1 | 0.49 / 0.73 / 0.78 | 24% / 39% / 52% |
| D at Finish 8 min, 0.3 / 0.4 / 0.5 | +0.064 / +0.046 / +0.013 | +0.010 / +0.006 / +0.000 | 6.3 / 5.8 / 5.0 | 0.63 / 0.76 / 0.80 | 33% / 42% / 53% |
| D at Finish 12 min, 0.3 / 0.4 / 0.5 | +0.041 / +0.030 / +0.015 | +0.003 / +0.002 / +0.002 | 5.2 / 5.0 / 4.7 | 0.86 / 0.88 / 0.90 | 47% / 50% / 56% |

What the tuning says:

- **The top level pays for every extra cut, about 0.01 for each half topic more a
  meeting.** No rule escapes it on learn83. The annotators' own fine level, read as
  topics, scores 0.244 on the top level, the same as d2: a perfect subtopic cutter
  would cost nothing there. The detector is far from that.
- **The fine level does not move.** Its best is B, 8 min, −0.005; every interval holds
  0. The rules find more fine changes (recall 20% to 27%), and draw more that are not
  (precision 81% to 76%), in about equal measure.
- **Waiting longer before splitting is cheaper.** At 3 minutes A costs +0.04 to +0.09;
  at 8 minutes +0.017 to +0.020. The first minutes of a topic are where the detector's
  doubt is real; a split late in a long topic is right more often.
- **Gating by length beats a lower threshold everywhere.** For 5.5 topics a meeting, C
  costs +0.024 top and +0.006 fine and leaves 56% of the talk in long topics; B at 8
  min costs +0.023 and −0.005 and leaves 47%; A at 8 min gives 5.0 topics for +0.017
  and leaves 51%.
- **Trees trained on the fine level do not find subtopics.** On their own, in the
  trainer's held-out score, they reach a fine Pk of 0.318 to 0.330 across the folds;
  d2's cuts score 0.319. Inside long topics
  (D) they act like a cautious A: cheapest on the top level (+0.008) but with the least
  effect on length (58% of the talk left in long topics), and they would add a second
  25 KB model to the app. Not worth it.
- **The detector's extra cuts beat blind ones.** Equal pieces of 8 minutes: +0.074 top
  and +0.026 fine for 6.1 topics. B at 5 min, 0.20 gives 6.7 topics for +0.056 and
  −0.001.

### eval24, one run (question 2, held out)

The shipped detector (it never saw these meetings), d2 and the two rules chosen on
learn83: A (`split: { after: 480, threshold: 0.2 }`) and B (`recordSplit: { after:
480, threshold: 0.25, spacing: 90 }`). Run once, after every choice above. d2 matches
round 2 (live 0.264, record 0.257).

#### 24 meetings, 12.5 h

| | view | Pk top | Δ top | WD top | Pk fine | Δ fine | WD fine | topics | P / R top | P / R fine | minutes p50 / p90 | long a meeting | talk in long topics | names changed an hour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| d2 | live | 0.264 | | 0.292 | 0.338 | | 0.361 | 4.3 | 66% / 31% | 71% / 14% | 4.7 / 18.7 | 0.96 | 64% | 22.4 |
| A | live | 0.269 | +0.005 [−0.021, +0.031] | 0.300 | 0.327 | −0.010 [−0.023, +0.001] | 0.353 | 4.9 | 61% / 36% | 72% / 17% | 5.4 / 12.7 | 0.88 | 47% | 25.7 |
| d2 | record | 0.257 | | 0.285 | 0.333 | | 0.358 | 4.5 | 67% / 36% | 71% / 16% | 3.4 / 20.9 | 0.96 | 68% | |
| A | record | 0.261 | +0.004 [−0.022, +0.029] | 0.292 | 0.322 | −0.011 [−0.023, +0.000] | 0.349 | 5.3 | 63% / 43% | 73% / 21% | 4.1 / 13.4 | 0.88 | 52% | |
| B | record | 0.260 | +0.003 [−0.022, +0.028] | 0.299 | 0.318 | −0.015 [−0.029, −0.002] | 0.348 | 5.9 | 61% / 46% | 72% / 22% | 4.1 / 10.9 | 0.75 | 44% | |

B's live view is d2's.

#### The 12 standard test meetings alone

| | view | Pk top | Δ top | Pk fine | Δ fine | topics | talk in long topics |
| --- | --- | --- | --- | --- | --- | --- | --- |
| d2 | live | 0.266 | | 0.349 | | 4.9 | 55% |
| A | live | 0.253 | −0.013 [−0.054, +0.022] | 0.335 | −0.014 [−0.036, +0.005] | 5.6 | 34% |
| d2 | record | 0.263 | | 0.348 | | 5.1 | 59% |
| A | record | 0.248 | −0.015 [−0.054, +0.021] | 0.332 | −0.015 [−0.037, +0.003] | 6.2 | 34% |
| B | record | 0.271 | +0.008 [−0.029, +0.048] | 0.336 | −0.011 [−0.032, +0.008] | 6.7 | 30% |

eval24 is kinder to both rules than learn83: no top-level cost outside the interval,
and a fine-level gain that excludes 0 for B. With 24 meetings the intervals are wide,
and the learn83 numbers (83 meetings, with a cost every time) are the safer guide.
Read the two together: a cost on the top level of 0 to 0.02, a gain on the fine level
of 0 to 0.015.

## What a person would see (question 3)

- **A, live**: from about 8 minutes into a topic, the next fair change of subject is
  drawn. The longest lane is cut in two (p90 topic 17 to 11 minutes live). About one
  more topic a meeting (4.2 to 5.0, meetings of 30 minutes); names change 2.5 to 3.3 more times an hour (22 to 25), and old
  lines move 8 more times an hour (32 to 40 on learn83, 29 to 37 on eval24), because a
  line near a new cut can still move.
- **B, at Finish**: nothing changes while recording. The record, the Intelligence panel
  and the topic graph show one or two more topics (4.3 to 5.5; on eval24 4.5 to 5.9),
  and a 20-minute topic becomes two or three. The flow card at the end and the record
  differ more than today (they already differ: the record is cut again with hindsight).
- **Both**: the new pieces of one long topic are next to each other and about the same
  thing, so the tracker keeps them apart (a cut was made between them) and names them
  apart (no two names alike). With phrase names, the second piece gets the next best
  phrase. Whether that reads as two subjects or as one subject named twice was not
  measured: no judge was run (no cloud models here). #193's descriptions would carry
  most of the difference.

## Options for Alex

1. **Leave it.** Long topics stay. The names (#193) do the work of telling them apart.
   Nothing to ship.
2. **B, the record split at Finish.** `detector: { recordSplit: { after: 480,
   threshold: 0.25, spacing: 90 } }`. Costs nothing while recording, shortens the
   record's long topics most (68% to 47% of the talk, eval24 44%), top level +0.023
   on learn83 and +0.003 on eval24. **My recommendation if long topics hurt in use.**
3. **A, the live split.** `detector: { split: { after: 480, threshold: 0.2 } }`. Also
   shortens the live lanes. Top level +0.017 on learn83 and +0.004 on eval24, about 3
   more name changes and 8 more moved lines an hour.
4. **A and B together** were not measured. B after A would split what A left long.
5. **Not recommended**: a lower threshold everywhere (C: worse on both levels for the
   same number of topics), subtopic trees (D: a second model for little effect), and
   splits after 3 to 5 minutes (two to five times the cost).

Before any of these ships, two checks would be worth it: a name judge on the split
topics (does a person tell them apart better?), and recognized speech (small.en quiet),
where the detector draws fewer cuts and long topics are longer.

## What was changed

- `src/helpers/topicChange.mjs`: `split` and `recordSplit` options of
  `TopicChangeDetector`, off by default; each pause's score kept (`scores`,
  `splitScores`). No setting of the app changes. Tests in
  `test/helpers/topicChange.test.js`.
- `scripts/topic-loop-eval.mjs`: `--set learn83`; the `splitModel` option (a file of
  trees for D).
- `scripts/lib/topic-corpus.mjs`: the fine level's boundary counts in
  `segmentationScores`.
- `scripts/topic-change-features.mjs`: `--fine`, targets at the fine level.
- `scripts/topic-split-folds.mjs` (new): the cross-fitted models and replays.
- `scripts/topic-split-eval.mjs` (new): the lengths, the fine stretches, both levels,
  the control.

## Not done

- **No name judge.** Whether split topics get names a person tells apart is the real
  question; it needs a judge model (cloud), which this study did not use.
- **No recognized speech**, and no ICSI scores of the rules (ICSI has a fine level too).
- **A and B together**, and B with a spacing other than 90 s.
- The live split's effect on how long a line waits for its topic was not looked at
  beyond "old lines moved".

## Reproduce

Public data only (AMI, ICSI; CC BY 4.0). No model call, no key. Node 24; lightgbm in
`~/oats-asr-cache/venvs/topics`. About 5 minutes of CPU in all.

```sh
AMI=~/oats-asr-cache/AMI; ICSI=~/oats-asr-cache/ICSI/nxt/ICSIplus; W=/tmp/oats-split
PY=~/oats-asr-cache/venvs/topics/bin/python
node scripts/topic-loop-eval.mjs --variant d2 --vectors --ami $AMI --set learn83 --json $W/d2-learn.json
LEARN=$(node -e "console.log(require('$W/d2-learn.json').results.map(r=>r.id).join(','))")

# Features, then six detectors that each leave a fold of series out (and the same for subtopics)
node scripts/topic-change-features.mjs --ami $AMI --meetings $LEARN --lag 45 --out $W/f/ami
node scripts/topic-change-features.mjs --icsi $ICSI --lag 45 --out $W/f/icsi
node scripts/topic-split-folds.mjs models --features $W/f --out $W/folds --python $PY
node scripts/topic-change-features.mjs --fine --ami $AMI --meetings $LEARN --lag 45 --out $W/ff/ami
node scripts/topic-change-features.mjs --fine --icsi $ICSI --lag 45 --out $W/ff/icsi
node scripts/topic-split-folds.mjs models --fine --features $W/ff --out $W/ffolds --python $PY

# Tuning runs: d2, then one run a rule
run() { node scripts/topic-split-folds.mjs run --models $W/folds --ami $AMI --json $W/$1.json --options "$2" $3; }
run cf-d2 '{}'
run A '{"detector":{"split":{"after":480,"threshold":0.2}}}'
run B '{"detector":{"recordSplit":{"after":480,"threshold":0.25,"spacing":90}}}'
run C '{"detector":{"threshold":0.3}}'
run D '{"detector":{"split":{"after":480,"threshold":0.5}}}' "--split-models $W/ffolds"
node scripts/topic-split-eval.mjs --ami $AMI --runs $W/cf-d2.json,$W/A.json,$W/B.json,$W/C.json,$W/D.json \
  --base $W/cf-d2.json --long-minutes 10 --even 8

# eval24, once
node scripts/topic-loop-eval.mjs --variant d2 --vectors --ami $AMI --set eval24 --json $W/e-d2.json
node scripts/topic-loop-eval.mjs --variant d2 --vectors --ami $AMI --set eval24 --json $W/e-A.json \
  --options '{"detector":{"split":{"after":480,"threshold":0.2}}}'
node scripts/topic-loop-eval.mjs --variant d2 --vectors --ami $AMI --set eval24 --json $W/e-B.json \
  --options '{"detector":{"recordSplit":{"after":480,"threshold":0.25,"spacing":90}}}'
node scripts/topic-split-eval.mjs --ami $AMI --runs $W/e-d2.json,$W/e-A.json,$W/e-B.json --base $W/e-d2.json --long-minutes 10
node scripts/topic-split-eval.mjs --ami $AMI --runs $W/e-d2.json,$W/e-A.json,$W/e-B.json --base $W/e-d2.json --long-minutes 10 \
  --only ES2004,IS1009,TS3003
```
