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
