# Speech, round 2: the best transcription for a room (2026-11-05)

Round 1 (`docs/dictation-accuracy.md`) found that recognition is the bottleneck
for everything downstream: steady-sound recognition costs summaries 34 to 47
points of coverage. This round looks for better recognition, on device and in
the cloud, or shows that nothing beats round 1.

## The bar and the split, written before the runs

**Baseline** (content-word recall: quiet room / steady sound / quiet mic, round
1, before the raise and the room denoise): `small.en` 74.3 / 37.9 / 69.0,
`large-v3-turbo` q5_0 80.0 / 46.5 / 74.5, `gpt-transcribe` 81.2 / 50.4 / 79.1.

**The current defaults.** Turbo q5_0 where it keeps up, else `small.en` on Apple
Silicon; `base.en` on Intel; `gpt-transcribe` in the cloud. The budget from
`src/helpers/speechTier.mjs`: 14 segments a minute, 4 reads a segment, 1.07 s a
read; a default may use 75% of it, 804 ms a read.

**A new on-device default must clear all of these:**

1. It beats the current default for that Mac class on content-word recall in
   both rooms (quiet room, steady sound) by at least 2 points, with a 95%
   bootstrap interval over meetings that excludes 0.
2. Invented phrases: no worse by more than 1 an hour. An invented phrase is a
   segment with no reference speech that comes back with words that no other
   run heard there (round 1's definition, "Text where nobody spoke").
3. It keeps up within the speechTier budget. State it for this Mac and estimate
   it for a base M-series Mac with 16 GB.
4. Its license is compatible with an MIT app.
5. Its download is under about 1.5 GB.

**A new cloud default:** the same accuracy test against `gpt-transcribe`, plus
latency and price.

**Second pass at Finish** (branch 1) is adopted only if summary coverage with
steady sound rises by at least 5 points (track Y measures it).

**The split.** Every model is run the same way through the app's segmenter and
scored by `room-replay.js`.

- **Screen:** the 8 Array1-01 meetings of round 1 (ES2004a-d, IS1009a-b,
  TS3003a-b), quiet room and steady sound. A model has no knobs here. Where a
  model is slow, a first screen uses every sixth segment (`--every 6`), the same
  segments for every model.
- **Tune:** anything with a knob (decode settings, VAD thresholds, context,
  enhancement gates) is tuned only on ES2004a, IS1009a and TS3003a, the three
  meetings round 1 tuned on.
- **Test:** the top 3 models, and any tuned setting that survives, run on the
  16 Array1-01 meetings that no speech run has seen: the rest of the 24 meetings
  the other evals use (eval24: IS1009c-d, TS3003c-d, ES2003b, ES2007a, ES2009c,
  ES2012a, ES2014c, IB4010, IS1002b, IS1004d, IS1007c, TS3005a, TS3007c,
  TS3010a). Nothing is tuned on these. The decision reads the intervals from
  these meetings.
