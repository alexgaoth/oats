# Dictation accuracy and speed — measured

"It feels weaker than it used to" is not something anybody can act on, and every
false claim in this repository's history passed a re-read and failed a probe. So
this is the measurement, the instrument that produced it, and the one
configuration change that explains the difference.

## The instrument

`scripts/asr-eval.js` runs the **real** transcription path — the same
`whisper-server` binary the app spawns, the same `/inference` endpoint, the same
arguments `buildWhisperServerArgs` produces — over a corpus with human reference
transcripts, and reports word error rate and latency.

```sh
# Corpus: LibriSpeech test-clean (public domain, ~346MB)
curl -sSL https://www.openslr.org/resources/12/test-clean.tar.gz | tar -xz

node scripts/asr-eval.js --corpus LibriSpeech/test-clean --n 40 --language en
node scripts/asr-eval.js --corpus LibriSpeech/test-clean --n 40 --language en --vad
node scripts/asr-eval.js --corpus LibriSpeech/test-clean --model ~/models/ggml-small.en.bin
node scripts/asr-eval.js --corpus LibriSpeech/test-clean --language en --concat 6 --whole
OPENAI_API_KEY=sk-... node scripts/asr-eval.js --corpus LibriSpeech/test-clean --cloud
```

It starts `resources/bin/whisper-server-<platform>-<arch>` the way the app does
and converts audio with the app's own FFmpeg (`ffmpeg-static`), so it runs on
macOS and Linux alike.

- `--vad` adds Silero VAD with the shipped config (`constants/whisperVad.json`;
  the model from `--vad-model`, default `resources/bin/whisper-vad/`). **That is
  how dictation runs by default** (`dictationSileroEnabled`), so a row without
  it is not what a user gets.
- `--concat N` joins N consecutive utterances of one chapter into one 30–90 s
  recording: a long dictation.
- A recording longer than 25 s is cut exactly as the app cuts it
  (`helpers/whisperRequestCuts.mjs`). `--whole` sends it as one request
  instead, as dictation did before 2026-10-08.

Each run reports a 95% interval for its WER, from resampling whole recordings.
The JSON (`--json`) keeps every recording's errors, so two runs over the same
sample can be compared recording by recording.

The sample is **stratified across the corpus**, not the first N utterances:
LibriSpeech is ordered by speaker, so the first N are two or three voices and the
number would move between runs without describing the system.

WER is Levenshtein over words after the normalisation ASR benchmarks agree on —
case folded, punctuation dropped, whitespace collapsed. Numbers are deliberately
left alone: "16" versus "sixteen" is a real difference to somebody dictating.

**Read `test-clean` as a floor.** It is read speech in quiet conditions. Real
dictation — an accent, a room, a technical vocabulary, a half-finished sentence —
is worse than this, never better.

## What was measured

40 utterances, 344s of audio, 891 reference words, 14 threads, one machine
(Fedora, no GPU backend), 2026-08-24. Every row uses the app's own
`buildWhisperServerArgs`, so a change to the shipped arguments changes the
benchmark too.

| configuration                                                    | WER       | median    | p95    | RTF   |
| ---------------------------------------------------------------- | --------- | --------- | ------ | ----- |
| `base` + `auto` — what shipped before this work                  | 7.74%     | 1952ms    | 3241ms | 0.242 |
| `base` + `en`                                                    | 7.74%     | 1090ms    | 2113ms | 0.140 |
| `base` + `en` + `--no-timestamps`                                | 7.18%     | 584ms     | 1124ms | 0.077 |
| **`base.en` + `en` + `--no-timestamps` — ships now for English** | **4.83%** | **446ms** | 711ms  | 0.055 |
| `small.en` + `en` + `--no-timestamps`                            | 4.15%     | 2377ms    | 4024ms | 0.291 |

**38% fewer errors and 4.4× faster** than the configuration that shipped, for an
English speaker who has set their language. Three separate changes got there:

### `--no-timestamps` was an accuracy bug, not a formatting preference

whisper.cpp v1.9.x turns token timestamps on for every request, which enables the
server's 60-character segment wrap. `split_on_word` is off, so the wrap lands on
a token boundary and breaks words in half; we join segments into one string, so
the break surfaces as a stray space _inside a word_. Upstream fixed this in
OpenWhispr #1348 and our fork predates it.

Found in our own eval output before the fix — the transcript said `overh anging`
for "overhanging" and `indisc reet` for "indiscreet", 4 such splits in 40
utterances. After the flag: 2, and both of those are compound-word judgments
(`main hall` for "mainhall"), not the wrap. WER 7.74% → 7.18%, median 1090ms →
584ms.

### `base.en` is strictly better than `base` for English

Same 148MB, same speed class, and it spent none of its capacity on the other
ninety-eight languages. 7.18% → 4.83% WER and 584ms → 446ms. The registry had no
`.en` entries at all, so this was unreachable from the product even for somebody
who wanted it.

It is selected automatically (`helpers/whisperEnglishModel.mjs`) and deliberately
**not** offered in the model picker: it is not a quality tier to weigh against
the others, it is the same tier with the dead weight removed, so there is nothing
for a person to decide. The selection falls back silently when the file is not on
disk — an upgrade that fails to load is worse than the model the user had.

### Language auto-detection still costs ~500ms, and that one is a real tradeoff

`preferredLanguage` defaults to `"auto"`, and `auto` needs the multilingual model
— an `.en` build has no language head to detect with. So a user who has never
opened Settings gets `base` + detection: 7.18% and 584ms, not 4.83% and 446ms.

That default is **kept on purpose.** Guessing English from the OS locale would be
right most of the time and catastrophic when wrong — a German speaker whose
laptop is in English would get their dictation mangled rather than merely slowed.
Slow is recoverable; wrong is not. Setting the language in Settings is one click
and it is the single highest-value thing a user can do for their dictation.

`small.en` buys another 0.7 points of WER for 5.3× the latency. That is a real
tradeoff and it belongs to the user, not to a default.

**Superseded on 2026-10-26: English is the default now.** The argument above
weighed one person dictating. In a room, detection was the bigger risk: in a
replay of eight AMI meetings (alexgaoth/oats#122) the multilingual models heard
far voices as Korean, Hindi or Welsh, and `base` + `auto` recovered 62.2% of the
words against 66.8% for `base.en` + `en`. The setup screen shows the language and
changes it, `auto` stays a choice in Settings, and an install that still had the
old default moves to English once (`helpers/speechLanguage.mjs`).

## Conversations, against OpenWhispr 1.10.2 (2026-10-04)

Dictation is one utterance. A conversation is an unbroken stream that somebody
has to cut, and **where it is cut** turned out to matter more than any flag.

The instrument: nine synthetic conversations (921s, two or three LibriSpeech
test-clean voices, 12 turns each, 0.25–1.15s between turns), each sent through
`whisper-server` four ways — fixed 5s chunks (what both apps did in a room),
cuts at pauses, the whole recording in one request, and cuts at the true turn
boundaries as a ceiling. `base`, `language auto`, 8 threads.

| how the stream is cut     | Oats flags | OpenWhispr 1.10.2 flags |
| ------------------------- | ---------- | ----------------------- |
| fixed 5s chunks           | 15.15%     | 14.27%                  |
| **at pauses — ships now** | **6.17%**  | 7.14%                   |
| whole recording           | 19.35%     | 5.91%                   |
| true turn boundaries      | 5.47%      | 5.56%                   |

- **The two apps transcribe the same, locally.** Upstream's only local change is
  `--max-len 4096` in place of `--no-timestamps`; on 40 dictation utterances it
  is worse (5.27% against 4.83% in English), so `--no-timestamps` stays.
- **Fixed chunks were the defect.** A 5s cut lands mid-word ~once per chunk and
  Whisper guesses both halves. Cutting at pauses (`helpers/speechSegmenter.mjs`,
  20s ceiling) is within a point of cutting at the true turns. With `base.en`:
  14.01% → 5.74%.
- **Never send more than one 30s window with `--no-timestamps`.** The "whole"
  row is that flag skipping every window after the first: whisper.cpp seeks by
  the last timestamp, and there is none. The segmenter's 20s cap is why it is
  safe. Dictation did send more, until 2026-10-08: see
  [A long dictation](#a-long-dictation).
- **What you hear as "OpenWhispr is clearer" is its default, not its model.**
  1.10.2 still defaults `useLocalWhisper` to `false`, so out of the box it
  transcribes in the cloud. Oats defaults to local by design (see below).

## Apple Silicon (M5 Pro, Metal)

Oats is going Mac-first, so the instrument was run on a Mac on 2026-10-08:
Apple M5 Pro (15 cores, 48GB), macOS 26.6, the `whisper-server-darwin-arm64`
the app ships (OpenWhispr's whisper.cpp 1.9.1 build), 13 threads. That build
uses Metal by itself — its log names `MTL0 (Apple M5 Pro)` and flash attention
— so every row is the app's own arguments and nothing more. One caveat on
speed: the build cannot compile Metal's tensor kernels here ("has tensor =
false"), so the M5's GPU neural accelerators are not used.

The n = 40 sample is the same 40 utterances as the Fedora table, and `base.en`
with `en` gives 4.83% on both machines: the two tables measure the same thing,
and only the speed differs. n = 200 is 1,454s and 3,951 words.

**Read every number as a floor, and read the intervals.** At n = 40 (891 words)
a row is good to about ±1.5 points. The shipped VAD is 1.1 points worse than no
VAD at n = 40 — and that gap is inside the noise there (paired 95%: −0.2 to
+2.8). At n = 200 the same gap is 0.6 (paired: +0.1 to +1.2), and real.

| configuration (all `--no-timestamps`)            | n = 40 WER (95%) | n = 200 WER (95%) | median | p95    |
| ------------------------------------------------ | ---------------- | ----------------- | ------ | ------ |
| `base.en` + `en`                                 | 4.83% (3.3–6.5)  | 5.09% (4.2–6.1)   | 56ms   | 102ms  |
| **`base.en` + `en` + VAD — ships for English**   | 5.95% (4.0–8.2)  | 5.69% (4.6–6.9)   | 71ms   | 148ms  |
| `base` + `en`                                    | 7.30% (5.0–9.9)  | 5.95% (4.9–7.1)   | 54ms   | 98ms   |
| `base` + `auto`                                  | 7.30% (5.0–9.9)  | 5.95% (4.9–7.1)   | 81ms   | 126ms  |
| **`base` + `auto` + VAD — ships out of the box** | 8.42% (6.1–11.2) | 6.61% (5.5–7.8)   | 98ms   | 174ms  |
| `small.en` + `en`                                | 4.15% (2.4–6.3)  | 3.95% (3.1–4.9)   | 147ms  | 240ms  |
| `large-v3-turbo-q5_0` + `en`                     | 1.80% (0.9–2.8)  | 2.58% (2.0–3.2)   | 620ms  | 673ms  |
| `large-v3-turbo-q5_0` + `en` + VAD               | 2.92% (1.4–4.7)  | 4.00% (2.6–6.2)   | 602ms  | 701ms  |
| `large-v3-turbo-q5_0` + `auto`                   | 1.80% (0.9–2.8)  | 2.58% (2.0–3.2)   | 1157ms | 1378ms |

Latency is per utterance, from the n = 200 runs. "VAD" is `--vad`: Silero with
the shipped config, which is on for dictation by default.

- **Metal makes every model fast enough to dictate with.** On the same 40
  utterances `base.en` answers in 59ms against 446ms on the Fedora CPU, and
  `small.en` in 156ms against 2,377ms. Even `large-v3-turbo` answers an
  utterance in about 0.6s.
- **The shipped VAD costs about half a point on clean speech.** +0.6 for
  `base.en`, +0.7 for `base` + `auto`, +1.4 for turbo, at n = 200. Part of it is
  doubled words where VAD joins its pieces — "she said, she said rather
  primly", "glided glided" — because the shipped `samplesOverlap` is 0.5s and
  whisper.cpp's own default is 0.1s. In a one-off run with only that field set
  to 0.1s, the doubled words were gone and `base.en` read 5.34%: about half the
  cost. Turbo with VAD also emptied one 13s utterance to "Horrible!". What VAD
  is for — no text invented in silence or room noise — is exactly what read
  speech in a quiet room cannot show, so this is evidence for a decision, not
  the decision. Whether VAD stays on is still open; its overlap is now settled
  (below).
- **What `auto` costs is the English model, not the detection.** Detection is
  27ms on `base` (81ms against 54ms with `en`, both 5.95%) and 540ms on turbo,
  whose encoder is most of its work. But `auto` needs the multilingual model,
  so it gives up `base.en`: 5.95% against 5.09%. Turbo has no English-only twin
  to give up, so with `auto` it keeps its 2.58%.
- **Turbo writes a third of its transcripts in lower case without
  punctuation.** 65 of 200 came back like "here it comes there it glides now it
  is up the ragged stump". WER removes case and punctuation before it counts,
  so no row above can see this; somebody pasting a dictation would. `base.en`
  and `small.en` did it 0 times in 200.

### A long dictation

Six consecutive utterances of one chapter, joined into one recording
(`--concat 6`): 40 recordings of 31–89s (median 41s), 1,872s and 5,076 words.
_Whole_ is what dictation did until now: the recording as one request. _Cut_ is
what it does now. Latency is for the whole recording, from Stop to text.

| configuration                                    | whole: WER (95%)  | cut: WER (95%)  | whole: median / p95 | cut: median / p95 |
| ------------------------------------------------ | ----------------- | --------------- | ------------------- | ----------------- |
| `base.en` + `en`                                 | 13.10% (7.2–20.0) | 4.37% (3.5–5.3) | 286 / 486ms         | 348 / 642ms       |
| **`base.en` + `en` + VAD — ships for English**   | 12.88% (8.1–18.2) | 4.63% (3.7–5.6) | 369 / 640ms         | 457 / 874ms       |
| **`base` + `auto` + VAD — ships out of the box** | 11.49% (7.0–17.0) | 5.79% (4.6–7.0) | 413 / 712ms         | 514 / 935ms       |
| `large-v3-turbo-q5_0` + `en`                     | 10.95% (7.8–14.6) | 3.21% (2.5–4.1) | 1206 / 1913ms       | 1300 / 2746ms     |

Sent whole, a long dictation lost words in a way no average describes. 6 of 40
came back with under 80% of their words, and 3 with ten words or fewer out of
80–124: a 48s, 124-word recording came back as "the princess inquired. But".
With `--no-timestamps` whisper.cpp cannot resume where its decoder stopped
inside a 30s window: it moves on by a whole window, and the rest of that window
is gone. VAD does not save it.

**Now** `WhisperServerManager.transcribe` cuts a recording longer than 25s
where the speaker pauses — found by the same `SpeechSegmenter` as the room path
— into pieces of at most 25s that cover it end to end, sends them in order, and
joins the text (`helpers/whisperRequestCuts.mjs`). A recording of 25s or less
still goes out as one request, byte for byte as before. The 40 recordings took
98 requests. Paired over the same recordings, cutting removes 8.7 points for
`base.en` (95%: 3.1 to 15.8) and 5.7 for the out-of-the-box row (1.8 to 10.8),
for 60–100ms of median latency. Every local Whisper request goes through it, so
a long upload or a re-transcribed recording is cut the same way.

### What the numbers say about the Mac default

The default model does not change here; that is the owner's call. The evidence:

- **For English, `small.en` is the cheap win.** 3.95% against 5.09% for
  `base.en` (paired: 1.1 points fewer, 0.6 to 1.8), 22% fewer errors, at 147ms
  and with punctuation intact. It costs a 488MB download, where `base.en` is
  148MB.
- **`large-v3-turbo-q5_0` is the accurate one, and the only one that is good
  with `auto`.** 2.58% against 6.61% for what ships out of the box (paired: 4.0
  points fewer, 3.1 to 5.0) — 61% fewer errors for somebody who never opens
  Settings — or 4.00% if the shipped VAD stays on with it. It costs 1.2s per
  utterance with `auto` (0.6s with `en`), a 574MB download, and 693MB of
  memory against 254MB for `base.en`. Two things stand between it and a
  default: a third of its output has no capitals or punctuation, and with VAD
  it once dropped a whole utterance. Both need a fix and a row first.

**The call (2026-10-26).** Apple Silicon now ships `small.en` for English in
place of `base.en`, and starts new installs on the `small` size
(`src/helpers/bundledWhisperModels.mjs`). The room replay below agreed: over 8
AMI meetings, `small.en` recovered 70.4% of a quiet room's words against 66.8%,
and 40.0% against 34.9% with steady sound, at 134ms a segment against 58ms.
With the shipped VAD on, as dictation runs, `small.en` scores 3.85% against
5.34% for `base.en` (n = 200; paired: 1.5 points fewer, 0.9 to 2.1), at a
159ms median against 70ms. One request for 5, 10 and 20s of speech takes
146–148, 213–227 and 330–365ms with `small.en`, against 63–74, 100–101 and
173–177ms with `base.en` and 90, 128 and 200–202ms with `base` + `auto` (median
of 15 each, two runs, M5 Pro, Metal, VAD on). Intel Macs and Linux keep
`base.en`, so where a table in this document says "ships for English", it now
means those two. Turbo stays an opt-in until its punctuation is fixed.

### The VAD overlap: 0.1s, not 0.5s (2026-10-08)

The one-off run above, repeated as rows. Same corpus and utterances, VAD on,
only `samplesOverlap` changed, both runs on the M5 Pro:

| configuration (VAD on)              | n   | 0.5s (shipped)  | 0.1s            | utterances better / worse | repeated phrases |
| ----------------------------------- | --- | --------------- | --------------- | ------------------------- | ---------------- |
| `base.en` + `en`                    | 200 | 5.69% (4.6–6.9) | 5.34% (4.4–6.4) | 12 / 5                    | 4 → 1            |
| `base` + `auto` (out of the box)    | 200 | 6.61% (5.5–7.8) | 6.48% (5.4–7.7) | 12 / 6                    | 2 → 0            |
| long dictation, `base.en`, cut      | 40  | 4.63% (3.7–5.6) | 4.16% (3.4–4.9) | 15 / 5                    | 6 → 1            |

Every row moves the same way, the repeated-phrase count (the mechanism)
falls in each, and median latency moves by 1–3ms. The intervals overlap, so
the claim is the direction and the mechanism, not the size. 0.1s is also
whisper.cpp's own default. It ships as the default for every VAD scope; the
settings store now reads it from `whisperVad.json` instead of repeating it.

## Who said it

Both apps carry sherpa-onnx diarization (pyannote segmentation 3.0) with the
3D-Speaker CAM++ voice model. Our 1.7.6 fork ran it only on a call's system
audio, so in a room nothing told voices apart; 1.10.2 also diarizes an in-person
mic track, still with CAM++ at 0.55 under 15 minutes. Measured on the same
conversations, as the share of turns given to the right person:

| voice model                     | count known | count guessed | held-out, guessed |
| ------------------------------- | ----------- | ------------- | ----------------- |
| CAM++ (both apps)               | 59%         | 38%           | —                 |
| WeSpeaker ResNet34              | 83%         | 82%           | —                 |
| **TitaNet-small, 0.85 — ships** | 96%         | 92.6%         | 91.7%             |

The threshold was swept on the first nine conversations (0.55 → 77%, 0.75 → 89%,
0.85 and 0.95 → 92.6%) and checked once on nine unseen ones. The models (46MB)
are bundled, not downloaded on demand: a speaker pass that needs a network is not
a default.

After Finish, the recording's own WAV is diarized once and each transcript
segment takes the speaker it overlaps most, by its `startMs`/`endMs` within the
recording (`helpers/speakerTurns.mjs`). Speakers are numbered by who spoke
first; one voice gets no label at all.

**Read these as a floor that flatters.** Read speech, clean audio, no crosstalk,
no real microphone. A café will be worse.

## Conversations in a room (2026-10-26)

A real conversation, 28 minutes around a laptop on a table, came back with
segments over 19% of it. The room was talking in the gaps: every conversation
keeps how loud each second was (`helpers/conversationLoudness.mjs`), and in
this one the median second in the gaps was 6 dB under the median second of
transcribed speech, and the loudest tenth of the gaps reached the quieter
quarter of it. 113 of its 146 turns were one voice, the one nearest the laptop.

### The instrument

`scripts/room-replay.js` replays a whole recording through the live room path,
offline, the way the app hears it: the renderer's 24 kHz chunks and main's own
`downsample24kTo16k`, the app's `SpeechSegmenter` fed chunk by chunk, every
closed segment through the app's own `WhisperServerManager` (its start options,
threads, FFmpeg conversion and request cuts) with Silero VAD and the shipped
config, and the app's own result filters. Partials are left out: they change
when words appear, not which words do. Against a reference with word times,
every reference word gets a fate:

- **under the level**: nothing opened a segment on it;
- **a cough**: it opened a segment that the segmenter threw away as too short;
- **an edge**: it had speech frames but fell outside the segment;
- **VAD** or **Whisper**: its segment was sent and came back empty;
- **text**: its segment came back with text, and the alignment says whether the
  word itself is in it.

It also reports coverage (the share of reference speech time inside a segment
sent to Whisper), words recovered (reference words the transcript has, by
alignment), WER (one alignment per meeting, the reference in time order),
segments with no reference speech and the text they produced, **purity** (the
share of a segment's words spoken by its main speaker: the speaker pass gives a
whole segment one voice, so this is the best a perfect diarizer can do), the
**final delay** (from the end of a word to the end of its segment: question
cards, topics and counters wait for that), and the real-time factor.
`--ablate-vad` sends every segment to a second server without VAD as well, so
what VAD costs and what it keeps out are both measured.

```sh
A=(); for m in ES2004a ES2004b ES2004c ES2004d IS1009a IS1009b TS3003a TS3003b; do
  A+=(--audio ami/audio/$m.Array1-01.wav); done
# a quiet room: each meeting at the real conversation's level
node scripts/room-replay.js "${A[@]}" --ami ami/annotations --level 0.0225 \
  --model ggml-base.en.bin --language en --ablate-vad --json out.json
# a room with steady sound under it
ffmpeg -f lavfi -i "anoisesrc=color=pink:duration=180:sample_rate=48000:amplitude=0.4:seed=11" \
  -af "highpass=f=80,lowpass=f=6000" -ac 1 pink.wav
node scripts/room-replay.js "${A[@]}" --ami ami/annotations --level 0.0225 \
  --noise pink.wav --noise-level 0.012 --model ggml-base.en.bin --language en
# before: the segmenter as it shipped
git show ed277e0:src/helpers/speechSegmenter.mjs > /tmp/before.mjs
node scripts/room-replay.js ... --segmenter /tmp/before.mjs
# the segmenter alone, seconds per meeting
node scripts/room-replay.js ... --segment-only
# near voices: LibriSpeech conversations
node scripts/room-replay.js --librispeech LibriSpeech/test-clean --conversations 9
# OpenAI on the same segments (public audio only): a file at a time, or a
# realtime session per meeting; --every 6 for a sample of the segments
OPENAI_API_KEY=... node scripts/room-replay.js ... --cloud gpt-transcribe --language en --concurrency 1
OPENAI_API_KEY=... node scripts/room-replay.js ... --realtime gpt-live-transcribe --language en
# dictation through OpenAI
OPENAI_API_KEY=... node scripts/asr-eval.js --corpus LibriSpeech/test-clean --cloud --cloud-model gpt-transcribe --language en --n 200
# before sound labels were dropped; and the experiments: noise out, a quiet segment raised
node scripts/room-replay.js ... --keep-sound-labels
node scripts/room-replay.js ... --denoise "afftdn=nf={nf}"
node scripts/room-replay.js ... --denoise "aformat=sample_fmts=flt,volume={gain},anlmdn=s=10,volume={ungain}"
node scripts/room-replay.js ... --normalize-rms 0.05
```

**The corpus** is the AMI meeting corpus (CC BY 4.0): eight meetings (ES2004a–d,
IS1009a–b, TS3003a–b), four people around a table in each, heard by the first
microphone of the array in the middle of the table (`Array1-01`), where a
laptop would be. 4.0 hours of audio, 3.2 hours of speech, 35,619 reference
words with their times. Three rooms:

- **A quiet room**: each meeting scaled so its median second has the real
  conversation's level (0.0225).
- **A room with steady sound**: the same with pink noise under it, an air
  conditioner or a fan, its median second at 0.012. As far as the real
  conversation's loudness can say, this is that room: its seconds spread the
  same way (5th, 50th and 95th percentiles 0.015, 0.026 and 0.054, against
  0.015, 0.023 and 0.058), and the shipped segmenter answers it the same way.
  Its segments with text cover 18% of the timeline (19% in the real one), 4.8
  a minute (5.2), 1.2, 1.9 and 3.8 s long at the 10th, 50th and 90th
  percentiles (1.2, 1.9 and 3.8).
- **A quiet microphone**: the meetings as AMI recorded them, speech near
  −50 dBFS.

### Where the speech went

The shipped segmenter, then `base.en` with `en` and the shipped VAD. Every
reference word:

| what happened to the word                | quiet room | steady sound | quiet microphone |
| ---------------------------------------- | ---------- | ------------ | ---------------- |
| never opened a segment (under the level) | 4.6%       | 31.8%        | 14.0%            |
| opened one, thrown away as a cough       | 11.2%      | 37.2%        | 23.3%            |
| cut off at a segment's edge              | 2.2%       | 2.2%         | 2.3%             |
| its segment came back empty              | 0.4%       | 0.8%         | 1.3%             |
| in a segment that came back with text    | 81.6%      | 28.1%        | 59.1%            |
| **recovered in the transcript**          | **57.4%**  | **14.6%**    | **41.1%**        |

By voice, loudest at the microphone first (each meeting's four, pooled):

| voice: coverage, recovered | quiet room | steady sound | quiet microphone |
| -------------------------- | ---------- | ------------ | ---------------- |
| loudest (−29 dBFS)         | 80%, 60%   | 42%, 26%     | 67%, 52%         |
| second (−31 dBFS)          | 72%, 60%   | 26%, 17%     | 53%, 44%         |
| third (−32 dBFS)           | 72%, 56%   | 20%, 11%     | 50%, 36%         |
| quietest (−34 dBFS)        | 71%, 54%   | 15%, 7%      | 47%, 34%         |

(The levels are the quiet room's; as AMI recorded them, the voices are 15 dB
quieter.)

### Why

1. **Every frame had to be three times the room.** The floor is the 5th
   percentile of the last 10 s of 20 ms frames, and a frame was speech over
   three times it (9.5 dB). A voice across the table reaches the laptop a few
   dB over the room: its loudest syllables pass 9.5 dB now and then, its other
   words never.
2. **So a far voice opened a segment and lost it as a cough.** A segment opened
   on one loud syllable closed once 400 ms in a row stayed under three times
   the floor, and with under 500 ms of such frames it was thrown away. That
   was the largest loss in every room.
3. **A fixed minimum of 0.004 (−48 dBFS).** Capture has no automatic gain, so
   a quiet microphone left whole voices under it: with the meetings as AMI
   recorded them (voices at −45 to −49 dBFS), 14% of the words never opened a
   segment and 23% were thrown away as coughs, and 41% came back.
4. **Then the model.** Of the words that reach `base.en` in a segment with
   text, it recovers about two thirds on these far-field meetings, against a
   5% WER on read speech. That is the model on a far microphone, not the
   path: see the models below.

Not the cause: VAD and the result filters (the segments that came back empty
held about 1% of the words), the scheduling (every closed segment is
transcribed, in order, before Stop returns; partials are previews), and capture
(echo cancellation, noise suppression and automatic gain are off for a room,
and the echo check has no system audio to compare against in one).

### The fix

A segment opens on a frame 2.5 times the floor (8 dB) and holds while frames
pass 1.5 times it (3.5 dB): two levels, so a far voice's softer words keep the
segment its loud syllables opened. Held through soft speech, a segment would
also be held through the soft gap between two people, so one longer than 2 s
splits at the quietest frame of a soft pause (300 ms under the opening level)
once half a second of speech follows it: contiguous, nothing dropped. The
minimum is 0.001 (−60 dBFS). `helpers/speechSegmenter.mjs`, pinned by
`test/helpers/speechSegmenter.test.js`: six of its tests fail on the old
segmenter.

| AMI, `base.en` + `en` + VAD, before → after              | quiet room              | steady sound            | quiet microphone        |
| -------------------------------------------------------- | ----------------------- | ----------------------- | ----------------------- |
| speech in a segment sent to Whisper                      | 72.0% → **98.3%**       | 23.0% → **84.8%**       | 51.6% → **98.2%**       |
| words recovered                                          | 57.4% → **66.8%**       | 14.6% → **34.9%**       | 41.1% → **61.7%**       |
| WER                                                      | 43.7% → **34.9%**       | 85.6% → **66.3%**       | 59.6% → **39.5%**       |
| transcript words per reference word                      | 70% → 82%               | 22% → 61%               | 49% → 75%               |
| quietest voice: coverage, recovered                      | 71%, 54% → 98%, 66%     | 15%, 7% → 81%, 31%      | 47%, 34% → 98%, 59%     |
| meetings with more words recovered                       | 8 of 8                  | 8 of 8                  | 8 of 8                  |
| purity                                                   | 85.4% → 85.7%           | 84.1% → 87.7%           | 85.3% → 85.7%           |
| final delay, median and p90                              | 1.9, 6.1 s → 2.1, 6.1 s | 1.1, 3.1 s → 1.6, 3.9 s | 1.6, 5.6 s → 2.1, 6.1 s |
| segments with no speech that came back with text (words) | 15 (78) → 24 (95)       | 2 (3) → 9 (29)          | 4 (36) → 14 (74)        |

**The split costs two points**, and keeps the speaker pass and the question
cards as they were. Without it the quiet room recovers 68.7% (WER 32.6%) and
the room with steady sound 36.9% (64.3%), but a lively meeting's segment then
runs 14 s at the median: purity falls to 79.0% and a word waits 6.6 s to be
final (14.1 s at the 90th percentile). The words lost are next to the
seams: within half a second of one, 60% came back against 66% unsplit (63%
against 68% without VAD), and from 4 s away there is no difference, so it is
Whisper reading a turn cut close, not VAD. Chosen on three meetings (ES2004a,
IS1009a, TS3003a; 57 minutes), quiet room, `base.en`:

| split                                                   | recovered | WER       | purity    | final delay, median and p90 |
| ------------------------------------------------------- | --------- | --------- | --------- | --------------------------- |
| the shipped segmenter (before)                          | 49.1%     | 52.1%     | 84.0%     | 1.6, 5.6 s                  |
| two levels, no split                                    | 61.5%     | 40.1%     | 77.7%     | 6.6, 14.1 s                 |
| in the middle of a 200 ms soft pause                    | 57.3%     | 44.1%     | 86.3%     | 1.9, 4.6 s                  |
| at the quietest frame of a 200 ms soft pause            | 57.9%     | 43.6%     | 86.3%     | 1.9, 4.9 s                  |
| the same, the pieces overlapping by 0.2 s               | 58.2%     | 44.5%     | 86.4%     | 2.1, 4.9 s                  |
| in the middle of a 200 ms soft pause, only after 4 s    | 58.5%     | 43.0%     | 83.7%     | 2.6, 5.9 s                  |
| **at the quietest frame of a 300 ms soft pause: ships** | **59.2%** | **42.4%** | **85.2%** | **2.1, 6.1 s**              |

**What is still lost** in the room with steady sound is the far voices'
quietest stretches, and the model. 5.7% of the words never reach the opening
level; VAD empties segments holding 5.5% of them, and without VAD 37.1% would
come back against 34.9%, but 93 segments with no speech in them would come
back with text, against 9. VAD stays. Of the words that reach `base.en` in a
segment with text, it recovers 40% here against 68% in the quiet room: at this
level of sound it is the model that loses them (see the models below). A
gentler VAD (threshold 0.35, not 0.5) empties fewer segments (1.7% of the
words against 5.5%), but Whisper then returns more of them empty, and the
words recovered move from 34.9% to 35.7%: not worth a setting that dictation
shares.

**Two leads, measured, not shipped:**

- **Raise a quiet segment before Whisper.** On the quiet microphone, each
  segment raised to an RMS of 0.05 (never past a 0.9 peak) before it is sent:
  61.7% → 67.3% recovered (WER 39.5% → 34.4%), better in 8 of 8 meetings, as
  good as the quiet room. Silero and Whisper both empty fewer quiet segments
  (4.1% of the words → 0.6%). The price: segments with no speech that came
  back with text, 14 → 31. It needs its own guards before it ships
  (`room-replay.js --normalize-rms 0.05`).
- **The language, not the model** (below).

### Guards

- **Dictation is unchanged.** The request cutter
  (`helpers/whisperRequestCuts.mjs`) finds a long dictation's pauses with the
  segmenter at its former levels. Tried with a first version of the room's
  levels, its cuts moved in 27 of 40 long dictations and WER moved inside its
  noise (`base.en` 4.16% to 4.08%, `base` + `auto` 5.14% to 5.36%): nothing to
  gain, so it keeps the levels it was measured with. `scripts/asr-eval.js` on
  LibriSpeech, before and after, with VAD: the same cuts, the same text and the
  same WER in all four rows — 5.34% (`base.en`, n = 200), 4.16% (`base.en`, 40
  long dictations), 6.48% (`base` + `auto`, n = 200), 5.14% (`base` + `auto`,
  long).
- **Near voices are no worse.** Nine LibriSpeech conversations (1,081 s, two or
  three voices, 12 turns, 0.25–1.15 s between them, over a room at −66 dBFS):
  WER 4.3% → 4.0% with `base.en`, 5.2% → 4.9% with `base` + `auto`; purity
  100% both. A word is final later, 2.4 s → 3.1 s after it was said at the
  median (7.4 s → 8.4 s at the 90th percentile): in a room that quiet, the
  minimum (0.001) is the level that holds a turn, so a turn stays open until
  its softest sounds end. At 0.002 the delay would be 2.6 s, but a quiet
  microphone would keep 91% of its speech instead of 98%.
- **Noise alone does not become words.** `base.en` and the shipped VAD, the
  same with `base` + `auto`:

| three minutes of…                      | segments, before → after | seconds sent    | text that came back                          |
| -------------------------------------- | ------------------------ | --------------- | -------------------------------------------- |
| a fan (brown noise, −40 and −30 dBFS)  | 0 → 0                    | 0               | none                                         |
| an air conditioner (pink, −38 dBFS)    | 0 → 0                    | 0               | none                                         |
| room tone (−74 dBFS)                   | 0 → 0                    | 0               | none                                         |
| typing on the laptop that records      | 5 → 7                    | 12 → 16 s       | none: VAD empties every one                  |
| music, 10.6 minutes (−40 and −30 dBFS) | 70 and 66 → 106          | 232–238 → 480 s | 1–4 → 3 segments, "(gentle music)", no words |

The music is sent twice as long as before (76% of it), and VAD empties all
but three of its segments; without VAD, `base.en` writes 0–2 words for it.

### Models on the same replay

The same segments for every model: the quiet room's 3,284, cut by the segmenter
as it ships now, and the room with steady sound's 3,584. Local models run with
the shipped VAD and the app's own arguments; OpenAI gets each segment as one
request, language `en`, without VAD. Speed is a separate run of three meetings
(ES2004a, IS1009a, TS3003a; 57 minutes) for each local model, one at a time on
the M5 Pro (Metal): the real-time factor is the server's time per second of
conversation; OpenAI's is the round trip per segment from this Mac.

| model + language                    | size   | quiet room: recovered, WER | steady sound: recovered, WER | speed                        |
| ----------------------------------- | ------ | -------------------------- | ---------------------------- | ---------------------------- |
| `base` + `auto`: ships              | 148 MB | 62.2%, 39.6%               |                              | RTF 0.020, 88 ms a segment   |
| `base.en` + `en`: ships for English | 148 MB | 66.8%, 34.9%               | 34.9%, 66.3%                 | RTF 0.013, 58 ms a segment   |
| `small` + `auto`                    | 488 MB | 58.8%, 42.4%               |                              | RTF 0.048, 218 ms a segment  |
| `small.en` + `en`                   | 488 MB | 70.4%, 30.9%               | 40.0%, 61.0%                 | RTF 0.028, 134 ms a segment  |
| `large-v3-turbo` q5_0 + `auto`      | 574 MB | 75.0%, 26.1%               |                              | RTF 0.206, 1089 ms a segment |
| `large-v3-turbo` q5_0 + `en`        | 574 MB | **75.2%, 25.9%**           | **47.5%, 53.5%**             | RTF 0.118, 603 ms a segment  |
| `gpt-4o-mini-transcribe` (OpenAI)   | cloud  | 73.0%, 28.4%               | 39.3%, 61.5%                 | 0.7 s a segment              |
| `gpt-4o-transcribe` (OpenAI)        | cloud  | 47.1%, 53.3%               | 25.9%, 74.2%                 | 0.7 s a segment              |

For scale: `base.en` given the reference's own speech as its segments (a
perfect segmenter) recovers 68.6% (WER 32.6%), against 66.8% from the
segmenter.

- **The language matters more than the size.** With `auto`, a multilingual
  model reads the language of each short segment of a far voice, and gets it
  wrong: `base` writes about 120 more segments than `base.en` in another
  language ("MBC 뉴스 김지경입니다.", Hindi, Chinese, Welsh), and `small` about
  340, so `small` + `auto` recovers less than `base` + `auto`. Turbo reads it
  right: with `auto` and with `en` it is within a run's noise (75.0% and
  75.2%).
- **`gpt-4o-transcribe` returns part of a segment.** For 31% of the segments it
  returned under 60% of the words `gpt-4o-mini-transcribe` returned for the
  same audio, and it wrote something for every segment with no speech in it
  (221; `base.en` with VAD: 24).
- **Turbo writes no sound labels.** `base.en` and `small.en` answer a far voice
  they cannot make out with "[inaudible]", "(muffled speaking)" and the like:
  153 and 198 segments with only that in the room with steady sound. Turbo: 1.

**For Alex** (the default model is not changed here):

1. **The segmenter is the larger gain in every room**, whatever the model:
   `base.en` +9.4 points of words recovered in the quiet room, +20.3 with
   steady sound. It ships here.
2. **For English, `small.en` is the cheap step and `large-v3-turbo` the
   accurate one.** On the same segments, `small.en` recovers 3.6 points more
   than `base.en` in the quiet room and 5.1 more with steady sound; turbo 8.4
   and 12.6 more, and with steady sound more than OpenAI's
   `gpt-4o-mini-transcribe` (47.5% against 39.3%). They cost 2.1× and 8.8× `base.en`'s time (real-time factor 0.028 and 0.118 against 0.013): every one keeps up with a conversation, but each partial re-reads its segment with the same model, so the live line falls further behind with turbo.
3. **The language is worth more than the size.** `auto` costs 4.6 points with
   `base` and 11.6 with `small` on far voices, and nothing with turbo. A conversation
   speaks one language for minutes at a time, so it could be read once from a
   longer stretch, or taken from Settings, instead of per segment: a product
   decision. Decided on 2026-10-26: English is the default, and the setup
   screen shows it (see "Language auto-detection" above).
4. **Not `gpt-4o-transcribe`** for this path: it drops parts of short segments.

### The words that matter

Words recovered and WER count every word the same, and most of a meeting's
words are ones a summary never needs and Whisper leaves out on purpose:
"yeah", "okay", "so", "I think". `room-replay.js` also scores three kinds of
words on their own, as recall, the share of them the transcript has:

- **content words**: the reference once fillers, backchannels and stopwords
  are gone, by the app's own lists (`tokenize` in
  `helpers/conversationTopics.mjs`, the words a topic is made of): 9,059 of the
  35,721 scored words. Topics, summaries and question cards are made of these.
- **numbers**: the words of what AMI marks as an amount, a measure, a
  percentage, a count, a date, a time or a duration (its NUMEX and TIMEX
  entities): 647 words in 422 mentions.
- **names**: the words of what AMI marks as a person, an organisation or a
  place (ENAMEX): 139 words in 92 mentions.

Numbers and names are also scored as whole mentions, every word right: a price
with one word wrong is a wrong price. And the transcript's own content words
are scored as **content precision**, the share of them that match a reference
word, so a change that hears more by inventing more shows it.

The runs above, scored again:

| quiet room               | words recovered | content words | numbers (whole)   | names (whole)     | content precision | WER   |
| ------------------------ | --------------- | ------------- | ----------------- | ----------------- | ----------------- | ----- |
| `base.en`                | 66.8%           | 69.2%         | 66.5% (63.0%)     | 58.3% (48.9%)     | 80.2%             | 34.9% |
| `small.en`: ships        | 70.4%           | 74.3%         | 71.1% (68.0%)     | 70.5% (65.2%)     | 85.8%             | 30.9% |
| `large-v3-turbo` q5_0    | 75.2%           | **80.0%**     | **75.6% (73.0%)** | **74.1% (69.6%)** | **89.8%**         | 25.9% |
| `gpt-4o-mini-transcribe` | 73.0%           | 76.5%         | 71.7% (70.1%)     | 71.2% (66.3%)     | 86.6%             | 28.4% |
| `gpt-4o-transcribe`      | 47.1%           | 55.1%         | 54.9% (52.1%)     | 57.6% (53.3%)     | 80.1%             | 53.3% |

| steady sound             | words recovered | content words | numbers (whole)   | names (whole)     | content precision | WER   |
| ------------------------ | --------------- | ------------- | ----------------- | ----------------- | ----------------- | ----- |
| `base.en`                | 34.9%           | 30.7%         | 35.2% (30.1%)     | 18.0% (12.0%)     | 51.1%             | 66.3% |
| `small.en`: ships        | 40.0%           | 37.9%         | 39.3% (35.1%)     | 26.6% (20.7%)     | 60.9%             | 61.0% |
| `large-v3-turbo` q5_0    | 47.5%           | **46.5%**     | **48.2% (44.8%)** | 34.5% (26.1%)     | **67.5%**         | 53.5% |
| `gpt-4o-mini-transcribe` | 39.3%           | 38.2%         | 38.8% (36.5%)     | **39.6% (31.5%)** | 59.3%             | 61.5% |
| `gpt-4o-transcribe`      | 25.9%           | 28.0%         | 33.1% (29.1%)     | 25.9% (19.6%)     | 49.9%             | 74.2% |

On the quiet microphone, `base.en` recovers 64.6% of the content words (61.7%
of all words), and 69.9% with each segment raised to an RMS of 0.05 (67.3%).

- **The content words set the models further apart than every word does.**
  In the quiet room, turbo recovers 4.8 points more words than `small.en` and
  5.7 points more content words; `base.en` 3.6 and 5.1 points fewer. With
  steady sound, turbo 7.4 and 8.7 points more. Paired 95% intervals, a
  bootstrap over the meetings' 243 minutes with both runs scored on the same
  words: turbo against `small.en` on content words 4.8–6.7 (quiet room) and
  7.7–9.8 (steady sound), better in 8 of 8 meetings each.
- **In a quiet room, the words lost are mostly the ones that matter least.**
  Every model recovers more content words than words. With steady sound the
  content words go with the rest (`small.en` 37.9% against 40.0%), and the
  transcript's own content words are wrong far more often (precision 60.9%
  against 85.8%).
- **Names suffer most from steady sound**: `small.en` hears 70.5% of the name
  words in the quiet room and 26.6% with steady sound. There are only 92
  mentions, so a gap under about ten points between two models is noise:
  `gpt-4o-mini-transcribe` against `small.en` with steady sound is +12.9
  points (4.4–21.6) on names and +0.3 (−0.8–1.5) on content words.
- **`gpt-4o-mini-transcribe` against `small.en`**: 2.2 points more content
  words in the quiet room (1.3–3.1, 8 of 8 meetings), level with steady sound.

### Remote models on the same replay (2026-10-28)

OpenAI lists nine models that transcribe (`GET /v1/models`): `whisper-1`;
`gpt-4o-transcribe`, `gpt-4o-mini-transcribe` with its two snapshots
(2025-03-20 and 2025-12-15), and `gpt-4o-transcribe-diarize`; and three newer
ones: `gpt-transcribe` (July 2026), which takes a file or a realtime session,
and `gpt-live-transcribe` and `gpt-realtime-whisper`, which take only a
realtime session. Each was given every segment of the eight meetings in the
three rooms, the segments the local models get:

- **a file at a time** (`room-replay.js --cloud`): one request per segment,
  language `en`, one at a time for each model and room, all of them at once,
  so that their times share one network. A segment's time is the round trip
  from this Mac.
- **a realtime session** (`--realtime`): one session per meeting, turn
  detection off, each segment streamed as live, then committed. A segment's
  time is from the commit, the end of its audio, to its transcript.

`gpt-4o-transcribe-diarize` writes about 2,200 tokens of speakers and times
for each minute of audio (about $0.026 a minute here, four times the others)
and answers in 3.2 s at the median. It was given every sixth segment of two
rooms (1,153): 79.0% of the words in the quiet room, 44.9% with steady sound.

| quiet room                                      | words recovered | content words | numbers | names | WER   | no-speech segments with text | time a segment, median and p95 |
| ----------------------------------------------- | --------------- | ------------- | ------- | ----- | ----- | ---------------------------- | ------------------------------ |
| `gpt-transcribe` (2026-07)                      | 77.8%           | 81.2%         | 79.0%   | 70.5% | 23.3% | 12 of 221                    | 0.93, 2.62 s                   |
| `gpt-4o-mini-transcribe`: the default until now | 72.8%           | 76.6%         | 72.0%   | 70.5% | 28.6% | 18 of 221                    | 0.90, 3.50 s                   |
| `gpt-4o-mini-transcribe-2025-12-15`             | 72.8%           | 76.5%         | 72.3%   | 67.6% | 28.6% | 16 of 221                    | 0.74, 2.40 s                   |
| `gpt-4o-mini-transcribe-2025-03-20`             | 54.7%           | 62.7%         | 58.7%   | 62.6% | 46.0% | 221 of 221                   | 1.76, 3.48 s                   |
| `gpt-4o-transcribe`                             | 46.8%           | 55.4%         | 54.9%   | 62.6% | 53.6% | 221 of 221                   | 0.93, 2.67 s                   |
| `whisper-1`                                     | 76.6%           | 80.1%         | 75.4%   | 70.5% | 27.3% | 183 of 221                   | 1.52, 3.51 s                   |
| `gpt-live-transcribe` (realtime only)           | 75.4%           | 77.8%         | 75.6%   | 70.5% | 26.1% | 25 of 221                    | 0.61, 2.27 s                   |
| `gpt-realtime-whisper` (realtime only)          | 72.0%           | 74.9%         | 72.2%   | 69.8% | 29.1% | 16 of 221                    | 0.55, 2.58 s                   |
| `small.en` on this Mac: ships                   | 70.4%           | 74.3%         | 71.1%   | 70.5% | 30.9% | 25 of 221                    | —                              |
| `large-v3-turbo` q5_0 on this Mac               | 75.2%           | 80.0%         | 75.6%   | 74.1% | 25.9% | 29 of 221                    | —                              |

| steady sound                                    | words recovered | content words | numbers | names | WER   | no-speech segments with text | time a segment, median and p95 |
| ----------------------------------------------- | --------------- | ------------- | ------- | ----- | ----- | ---------------------------- | ------------------------------ |
| `gpt-transcribe` (2026-07)                      | 49.8%           | 50.4%         | 51.5%   | 47.5% | 50.8% | 3 of 132                     | 0.85, 2.23 s                   |
| `gpt-4o-mini-transcribe`: the default until now | 39.4%           | 38.4%         | 39.7%   | 38.1% | 61.4% | 5 of 132                     | 0.82, 2.83 s                   |
| `gpt-4o-mini-transcribe-2025-12-15`             | 39.2%           | 38.2%         | 41.0%   | 39.6% | 61.5% | 5 of 132                     | 0.65, 1.82 s                   |
| `gpt-4o-mini-transcribe-2025-03-20`             | 27.8%           | 29.1%         | 34.6%   | 24.5% | 72.4% | 132 of 132                   | 1.67, 2.90 s                   |
| `gpt-4o-transcribe`                             | 25.8%           | 28.0%         | 32.3%   | 25.2% | 74.3% | 132 of 132                   | 0.82, 2.23 s                   |
| `whisper-1`                                     | 50.8%           | 49.0%         | 50.5%   | 33.8% | 52.0% | 109 of 132                   | 1.42, 3.30 s                   |
| `gpt-live-transcribe` (realtime only)           | 44.1%           | 43.3%         | 49.5%   | 38.8% | 56.6% | 14 of 132                    | 0.62, 1.49 s                   |
| `gpt-realtime-whisper` (realtime only)          | 37.8%           | 37.2%         | 37.1%   | 32.4% | 62.6% | 4 of 132                     | 0.54, 1.57 s                   |
| `small.en` on this Mac: ships                   | 40.0%           | 37.9%         | 39.3%   | 26.6% | 61.0% | 9 of 132                     | —                              |
| `large-v3-turbo` q5_0 on this Mac               | 47.5%           | 46.5%         | 48.2%   | 34.5% | 53.5% | 14 of 132                    | —                              |

| quiet microphone                                | words recovered | content words | numbers | names | WER   | no-speech segments with text | time a segment, median and p95 |
| ----------------------------------------------- | --------------- | ------------- | ------- | ----- | ----- | ---------------------------- | ------------------------------ |
| `gpt-transcribe` (2026-07)                      | 75.6%           | 79.1%         | 76.2%   | 69.1% | 25.4% | 9 of 218                     | 0.93, 2.62 s                   |
| `gpt-4o-mini-transcribe`: the default until now | 72.7%           | 77.0%         | 70.3%   | 68.3% | 28.5% | 12 of 218                    | 0.92, 3.40 s                   |
| `gpt-4o-mini-transcribe-2025-12-15`             | 72.6%           | 76.8%         | 69.7%   | 69.1% | 28.7% | 12 of 218                    | 0.74, 2.48 s                   |
| `gpt-4o-mini-transcribe-2025-03-20`             | 54.8%           | 62.1%         | 57.7%   | 59.7% | 45.9% | 218 of 218                   | 1.76, 3.37 s                   |
| `gpt-4o-transcribe`                             | 46.2%           | 54.6%         | 53.3%   | 57.6% | 54.2% | 218 of 218                   | 0.90, 2.52 s                   |
| `whisper-1`                                     | 75.8%           | 79.6%         | 75.4%   | 71.9% | 27.0% | 164 of 218                   | 1.47, 3.43 s                   |
| `gpt-live-transcribe` (realtime only)           | 74.5%           | 77.1%         | 75.7%   | 69.8% | 26.9% | 22 of 218                    | 0.59, 0.83 s                   |
| `gpt-realtime-whisper` (realtime only)          | 67.6%           | 70.5%         | 63.7%   | 63.3% | 33.4% | 9 of 218                     | 0.51, 0.68 s                   |
| `small.en` on this Mac: ships                   | 64.5%           | 69.0%         | 62.9%   | 62.6% | 36.4% | 11 of 218                    | —                              |
| `large-v3-turbo` q5_0 on this Mac               | 69.7%           | 74.5%         | 65.5%   | 66.2% | 31.1% | 15 of 218                    | —                              |

The local rows are the runs above, for scale; their speed is in "Models on the
same replay".

- **`gpt-transcribe` hears the most, and invents the least.** Against
  `gpt-4o-mini-transcribe`, the default until now, on the same words (paired
  95% intervals over the meetings' 243 minutes): 5.0 more points of the words
  in a quiet room (4.4–5.7) and 4.6 more of the content words (3.7–5.6); 10.4
  (9.7–11.2) and 12.0 (10.8–13.2) with steady sound; 2.9 (2.1–3.7) and 2.1
  (1.2–3.1) on the quiet microphone. Fewer segments with no speech came back
  with text in each room (18 → 12, 5 → 3, 12 → 9). A segment took as long at
  the median (10 to 32 ms more) and 0.6 to 0.9 s less at the 95th percentile.
  It costs $0.0045 a minute, against $0.003. With steady sound it hears more
  than turbo on this Mac (49.8% against 47.5%).
- **Through a realtime session**, the path a conversation with a cloud
  provider takes, the gap is the same: on every sixth segment, 77.3% of the
  words against 71.3% in the quiet room and 53.2% against 41.9% with steady
  sound, the transcript 40–80 ms later after the commit at the median.
- **`gpt-4o-mini-transcribe` and its 2025-12-15 snapshot hear the same**,
  within 0.2 points in each room, but the snapshot answered 150–185 ms sooner
  at the median in each room: the alias costs time to reach the model it
  names.
- **`whisper-1` hears almost as much, and writes over silence**: text for 183
  of the 221 segments with no speech in the quiet room (`gpt-transcribe`: 12),
  and 1.5 s a segment at the median.
- **`gpt-4o-transcribe` and the 2025-03-20 snapshot leave out parts of
  segments** (47–55% of the words) and write something for every segment with
  no speech in it: not for this path.
- **The realtime-only models** hear less than `gpt-transcribe` with a file
  (`gpt-live-transcribe` 75.4%, 44.1% and 74.5% in the three rooms;
  `gpt-realtime-whisper` 72.0%, 37.8% and 67.6%) and cost $0.017 a minute,
  almost four times as much. Their transcript comes 0.5–0.6 s after the
  commit at the median, as `gpt-transcribe`'s does through the same kind of
  session (dictation, below).

**Dictation.** LibriSpeech test-clean through `asr-eval.js --cloud`, language
`en`, scored as `asr-eval` scores it (numbers as written): 200 utterances and
40 long dictations (30–90 s). With an OpenAI key the app dictates through a
realtime session with its own server VAD (`openaiRealtimeStreaming.js`), so
that path was measured too: the same 200 utterances, each streamed as live and
committed as the key is released, its time from the release to its last
transcript.

| LibriSpeech, WER                                | 200 utterances | 40 long dictations | realtime with a key: WER; release to transcript, median and p95 |
| ----------------------------------------------- | -------------- | ------------------ | --------------------------------------------------------------- |
| `gpt-transcribe`: the default now               | 2.33%          | 2.32%              | 2.46%; 0.66, 1.30 s                                             |
| `gpt-4o-mini-transcribe`: the default until now | 2.66%          | 2.60%              | 3.01%; 0.67, 2.55 s                                             |
| `gpt-4o-mini-transcribe-2025-12-15`             | 2.68%          | 2.48%              |                                                                 |
| `gpt-4o-mini-transcribe-2025-03-20`             | 2.83%          | 2.54%              |                                                                 |
| `gpt-4o-transcribe`                             | 2.40%          | 2.60%              |                                                                 |
| `whisper-1`                                     | 3.34%          | 3.88%              |                                                                 |

On read speech every `gpt-4o-*` model and `gpt-transcribe` is within a few
tenths of a point (`gpt-transcribe` against the default: −0.33 points on the
200, interval −0.70 to +0.03). Through the realtime path, `gpt-transcribe`'s
transcript arrives as soon at the median and half as late at the 95th
percentile.

**`gpt-transcribe` is the default now**, for new settings: first in the
registry, and the default of the realtime catalog, so dictation with a key and
conversations with a cloud provider use it too (the app's server-VAD session
works with it unchanged, and it streams over HTTP as the `gpt-4o-*` models
do). A model a person chose stays theirs.

### Before and after Whisper (2026-10-28)

With steady sound, most of what the segmenter sends is lost in the model. Two
things can be done to a segment before Whisper hears it, and one to what comes
back. Each was replayed with `small.en`, which ships on Apple Silicon, on all
eight meetings in each room, alone and together, and scored on the same words
as without it (paired 95% intervals over the meetings' 243 minutes). A change
ships if it brings back words and writes no more where nobody spoke.

- **The room's sound taken out** (`room-replay.js --denoise`), with FFmpeg's
  own filters. `afftdn` (FFT) needs its noise floor where the room's is, and a
  fixed one fits one room: at -35 dB, right for the steady sound, it took 9 dB
  out of the quiet microphone's speech. So its floor is the segment's own (the
  RMS of its quietest tenth of 20 ms frames) plus 1 dB, chosen on three
  meetings with steady sound (plus 5 dB: +2.0 points; plus 1: +3.2; a fixed
  -35: +3.1). `anlmdn` (non-local means) at strength 10, each segment moved so
  its floor is at -38 dBFS, and back.
- **A quiet segment raised** to an RMS of 0.05, never past a 0.9 peak
  (`--normalize-rms 0.05`).
- **A segment that comes back as only a sound label** ("[inaudible]",
  "(muffled speaking)", "(door closes)") dropped.

| `small.en`, against none               | steady sound: words; content words        | quiet microphone                           | quiet room                               |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| none (what ships)                      | 40.0%; 37.9%                              | 64.5%; 69.0%                               | 70.4%; 74.3%                             |
| `afftdn` at the segment's floor + 1 dB | +2.1 (+1.4 to +2.7); +2.1 (+1.2 to +2.9)  | −0.3 (−0.9 to +0.2); −1.0 (−1.8 to −0.3)   | −0.1 (−0.6 to +0.4); −0.4 (−1.0 to +0.2) |
| `anlmdn`, strength 10                  | −7.1 (−7.9 to −6.2); −8.8 (−10.0 to −7.7) | −8.4 (−9.3 to −7.5); −11.0 (−12.3 to −9.7) | —                                        |
| raised to an RMS of 0.05               | +1.0 (+0.7 to +1.3); +0.9 (+0.4 to +1.4)  | +6.4 (+5.5 to +7.4); +5.7 (+4.6 to +6.9)   | +0.6 (+0.2 to +0.9); +0.4 (−0.1 to +0.9) |
| `afftdn`, then raised                  | +3.0 (+2.3 to +3.6); +2.6 (+1.7 to +3.5)  | +6.1 (+5.2 to +7.0); +4.7 (+3.7 to +5.8)   | —                                        |

**Text where nobody spoke.** The segments with no reference speech that come
back with words are not all invented: AMI leaves the talk before and after a
meeting untranscribed. So each was checked against the same stretch in three
other runs (turbo, `gpt-transcribe` and `gpt-4o-mini-transcribe`, quiet room):
words one of them also heard there are speech the reference does not have;
words only this run wrote are invented. With sound labels dropped on both
sides:

| segments with no speech that came back with words: heard by another run; only this one | steady sound | quiet microphone | quiet room |
| -------------------------------------------------------------------------------------- | ------------ | ---------------- | ---------- |
| none (what ships)                                                                      | 4; 5         | 10; 0            | 16; 3      |
| `afftdn` at the segment's floor + 1 dB                                                 | 7; 5         | 11; 1            | 16; 9      |
| `anlmdn`, strength 10                                                                  | 1; 3         | 8; 0             | —          |
| raised to an RMS of 0.05                                                               | 4; 4         | 17; 4            | 17; 4      |
| `afftdn`, then raised                                                                  | 8; 5         | 16; 9            | —          |

- **Dropping sound labels ships**: a segment whose text is only labels comes
  back empty (`helpers/soundLabels.mjs`, for finals and partials). With steady
  sound, `small.en` wrote 200 of them in four hours and `base.en` 154, about
  one a minute, and the app showed each as a line somebody said (quiet room 21
  and 19, quiet microphone 30 and 19). Turbo writes a lone "-" instead (27);
  `gpt-transcribe` none. The words recovered and WER do not move: a label is
  not a word. Three minutes of music, which `base.en` labelled "(gentle
  music)", now come back with nothing; LibriSpeech conversations have no
  labels to drop.
- **Taking the sound out does not ship.** `afftdn` brings back 2.1 points of
  the words with steady sound (8 of 8 meetings) and invents nothing more
  there, but in a quiet room it brings back nothing and writes six more
  phrases where nobody spoke ("Thank you.", "Happy birthday."), and on the
  quiet microphone it loses a point of the content words; `base.en` the same
  (+2.7 with steady sound, -1.4 content words in a quiet room). Together with
  the raise it gains less than the raise alone on the quiet microphone and
  invents more. `anlmdn` loses words in every room, and its traces make
  `small.en` write labels: 570 with steady sound. Dictation would not gain
  either (LibriSpeech, `small.en`, 200 utterances: 3.85% → 3.64% with
  `afftdn`, interval −0.46 to +0.07).
- **A quiet segment raised does not ship, and it comes closest.** On the quiet microphone it brings back 6.4 points of the words
  and 5.7 of the content words, in 8 of 8 meetings: the quiet microphone then
  hears as the quiet room does (70.9% against 70.4%). It also writes there
  what a louder room writes over silence: four short phrases in four hours
  ("Thank you.", "3.10 days left."), against none, and one more in the quiet
  room. With steady sound it brings back a point and invents nothing more;
  LibriSpeech conversations do not move (2.7% WER), and noise alone (a fan, an
  air conditioner, typing, music) comes back with no words, raised or not.
  `base.en`: +5.6 points on the quiet microphone with four more phrases, +0.6
  with steady sound, +0.7 in a quiet room.

**Turbo** answers the same way. `afftdn` brings back 1.8 points with steady
sound (content words 1.1–2.7) and writes four more phrases where nobody spoke
(11 → 15: turbo writes "Thank you." where `small.en` writes a label); on the
quiet microphone it loses a point of the words (0.4–1.5). Raised, turbo hears
5.9 more points on the quiet microphone (5.0–6.8; content words 5.6) and 0.7
with steady sound, and writes eight more phrases where nobody spoke on the
quiet microphone (5 → 13: "you", "Thank you.").

### What this does not show

- **The real conversation was not replayed.** Its audio is deleted after the
  speaker pass, so the claim for it rests on the replay reproducing its
  numbers: the share of the timeline, the turns a minute, their lengths and
  the spread of its loudness.
- **AMI is one microphone in a meeting room**, not a MacBook in a café. The
  steady sound is pink noise; another room's sound may be other people
  talking, which no level can tell from the conversation.
- **Purity is a ceiling**: it assumes a diarizer that never errs.
- **Overlapping speech counts against every configuration**, and the
  normalisation is a small version of Whisper's: fillers out on both sides,
  digits spelled out.
- **Metal is not deterministic.** The same configuration run twice returned
  different words for 2–6% of its segments, and words recovered moved by up to
  0.4 points in a meeting: a difference under a point is inside that.
- **Remote times are one network on one afternoon.** Every model ran at the
  same time, so they are fair to each other, not to another office. The
  alias answering later than its own snapshot held in all three rooms.
- **Partials are not replayed.** A heavier model also makes every partial
  slower, so the live line falls further behind; finals are not affected.
- **Timestamps lag a second each half hour.** `downsample24kTo16k` keeps 533
  samples of each 800-sample chunk, a third of a sample short, so the
  recording's own clock runs 0.06% slow and a segment's `startMs` falls behind
  the moment it was said: about a second after half an hour. The replay
  scores on true time; the app does not correct it.

## Why it feels different from the pre-Oats build

`../oats` (OpenWhispr 1.7.6) defaults `useLocalWhisper` to **false**. With an API
key configured — and there is one in that profile — dictation goes to OpenAI
`gpt-4o-mini-transcribe`. Oats defaults it to **true**, deliberately: the product
promises to work with no network, no model and no account, and it bundles a
Whisper model so that promise is real on first run.

That is the whole of the difference in the dictation path. `whisperServer.js` is
byte-identical between the two trees; `whisper.js` differs only by Oats adding
the bundled-model install. The trade was made on purpose — but it was made
against `base` + `auto`, which is the worst of the four rows above, and nothing
measured it at the time.

The cloud row is not filled in here. `--cloud` exists in the tool and takes one
command, but running it spends the key owner's credits, and that is not a
script's decision to make.

## Upstream

OpenWhispr is at **1.10.2** (2026-10-02); both trees here are forked from
**1.7.6**.
`--no-timestamps` is ported and measured above. Still unevaluated: upstream's
`--device` GPU index, and ~3,000 lines of divergence in `audioManager.js`.
