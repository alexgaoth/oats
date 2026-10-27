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
# OpenAI on the same segments (public audio only)
OPENAI_API_KEY=... node scripts/room-replay.js ... --cloud gpt-4o-transcribe
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
