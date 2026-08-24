# Oats vs OpenWhispr: is transcription actually worse?

Short answer: **it was, and the cause was not the one anybody guessed.** Two of
the three problems were bugs we could fix; the third is a deliberate trade.

## How this was measured

Not by reading the code. `scripts/asr-eval.js` runs the **real** transcription
path — the app's own `buildWhisperServerArgs`, the shipped `whisper-server`
binary, the same `/inference` endpoint — over **LibriSpeech test-clean**: 2,620
recordings of real people reading, each with a human reference transcript.

```sh
curl -sSL https://www.openslr.org/resources/12/test-clean.tar.gz | tar -xz
node scripts/asr-eval.js --corpus LibriSpeech/test-clean --n 40 --language en
```

40 utterances, 344 seconds of speech, 891 reference words, one machine (Fedora,
14 threads, no GPU). The sample is spread across the corpus, not taken from the
front — LibriSpeech is ordered by speaker, so the first 40 clips are two or three
voices and would describe those voices rather than the system.

Two numbers per run:

- **WER** — word error rate, the standard Levenshtein-over-words measure, after
  the normalisation ASR benchmarks agree on (case folded, punctuation dropped).
  Lower is better. Numbers are deliberately _not_ normalised: "16" versus
  "sixteen" is a real difference when you are dictating.
- **Median latency** — wall-clock per utterance, which is what "feels quick" is.

**Read every number as a floor.** This is read speech in a quiet room. Your real
dictation — an accent, a room, a technical vocabulary, a half-finished sentence —
is worse than this, never better. The comparison between rows still holds.

## Was there a difference? Yes.

| configuration           | WER       | median    |
| ----------------------- | --------- | --------- |
| what Oats shipped       | 7.74%     | 1952ms    |
| **what Oats ships now** | **4.83%** | **446ms** |

**38% fewer errors, 4.4× faster.** Three causes, in order of how much they hurt.

### 1. Words were being cut in half (a bug, now fixed)

whisper.cpp v1.9.x turns on token timestamps for every request, which enables the
server's 60-character line wrap. Word splitting is off, so the wrap lands
mid-token — and because we join the pieces into one string, it comes out as a
**stray space inside a word**.

In our own eval output, before the fix: `overhanging` → `overh anging`,
`indiscreet` → `indisc reet`. Four in forty utterances.

That is what "it does not hear what I mean" looks like from the outside. It is
not a mis-heard word; it is a correctly heard word broken in two. OpenWhispr
fixed this upstream in #1348 and we were forked from a version before it. Passing
`--no-timestamps` costs nothing — we only ever read the text.

**7.74% → 7.18% WER, 1090ms → 584ms.**

### 2. We shipped the wrong model for English (now fixed)

Whisper publishes two families at every size: multilingual (`base`) and
English-only (`base.en`). Same file size, same speed class. The English-only build
spent none of its capacity on the other ninety-eight languages.

Oats bundled only the multilingual one, and the model registry had **no `.en`
entries at all** — so it was unreachable even for somebody who went looking.

`base.en` now ships beside `base` and is chosen automatically when your language
is English. It is not offered as a menu item, because it is not a quality tier to
weigh against the others — it is the same tier with the dead weight removed, so
there is nothing to decide.

**7.18% → 4.83% WER, 584ms → 446ms.**

### 3. The pre-Oats build was not doing this locally at all

This is the honest answer to "why does the old one feel better".

`../oats` — OpenWhispr 1.7.6 — defaults `useLocalWhisper` to **false**. With an
API key configured, its dictation goes to OpenAI's `gpt-4o-mini-transcribe`.
Oats defaults it to **true**.

That was deliberate. Oats promises to work with no network, no account and no
model download, and it bundles a model so that promise is real on first run. The
cost is that a hosted model trained on far more data is no longer doing the work.

**Everything else in the transcription path is identical.**
`src/helpers/whisperServer.js` is byte-for-byte the same in both trees;
`whisper.js` differs only by Oats adding the bundled-model install. Nothing was
quietly rewritten. The trade was made on purpose — but it was made against the
_worst_ of the configurations above, and nobody measured it at the time.

## What you can still do

**Set your language in Settings.** The default is "auto", which needs the
multilingual model and costs ~140ms and about two points of WER. One click.

The default stays "auto" on purpose: guessing English from your OS locale would
be right most of the time and badly wrong for somebody dictating German on an
English laptop. Slow is recoverable; wrong is not.

**If you want the cloud back**, the setting is still there — Oats changed the
default, not the capability.

## What has not been measured

The **cloud row is empty**. `--cloud` exists in the tool and takes one command,
but running it sends audio to OpenAI and spends the key owner's credits, which is
not a script's decision:

```sh
OPENAI_API_KEY=sk-... node scripts/asr-eval.js --corpus LibriSpeech/test-clean --cloud
```

Upstream OpenWhispr is now **1.8.3** against our **1.7.6**. `--no-timestamps` and
the `--device` GPU index are ported. The remaining ~3,000 lines of divergence in
`audioManager.js` are a streaming-transcription and screen-context agent
architecture built on providers this fork removed, and are deliberately not
taken.

Numbers and method: `docs/dictation-accuracy.md`.
