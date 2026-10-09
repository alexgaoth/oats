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
node scripts/asr-eval.js --corpus LibriSpeech/test-clean --model ~/models/ggml-small.en.bin
OPENAI_API_KEY=sk-... node scripts/asr-eval.js --corpus LibriSpeech/test-clean --cloud
```

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
  safe.
- **What you hear as "OpenWhispr is clearer" is its default, not its model.**
  1.10.2 still defaults `useLocalWhisper` to `false`, so out of the box it
  transcribes in the cloud. Oats defaults to local by design (see below).

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
