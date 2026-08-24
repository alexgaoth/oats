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
(Fedora, no GPU backend), 2026-08-24.

| configuration                               | WER       | median    | p95    | real-time factor |
| ------------------------------------------- | --------- | --------- | ------ | ---------------- |
| **`base` + `--language auto`** — what ships | **7.74%** | 1952ms    | 3241ms | 0.242            |
| `base` + `--language en`                    | 7.74%     | 1090ms    | 2113ms | 0.140            |
| **`base.en` + `--language en`**             | **5.72%** | **875ms** | 2783ms | 0.121            |
| `small.en` + `--language en`                | 4.60%     | 3819ms    | 8138ms | 0.497            |

Two findings, both free of tradeoffs for an English speaker:

1. **Language auto-detection costs ~860ms per utterance and buys nothing.**
   Identical WER, 44% slower. `preferredLanguage` defaults to `"auto"`, and it is
   plumbed correctly — a user who sets their language in Settings already gets
   this. A user who never opens Settings pays for detection on every dictation.

2. **`base.en` is both more accurate and faster than the `base` we bundle** —
   26% fewer errors and 2.2× faster at the same file size (148MB). The model
   registry has no `.en` variants at all, so the English-only models are not
   reachable from the product even by a user who wants them.

`small.en` buys another 1.1 points of WER for 4.4× the latency. That is a real
tradeoff and belongs to the user, not to a default.

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

OpenWhispr is at **1.8.3**; both trees here are forked from **1.7.6**. Upstream's
`whisperServer.js` has since added `--no-timestamps` and a `--device` GPU index,
and `audioManager.js` has diverged by ~3,000 lines. None of that has been
evaluated. If dictation latency matters, that diff is the next place to look.
