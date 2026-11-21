# Live map baselines

## Checks 1 and 2: questions and outcomes

Base: [`7337403`](https://github.com/alexgaoth/oats/commit/73374038482dd035c8e6a705c6cd4988332fe469)
(Oats 0.3.0). Node 24.22.2. These runs use the shipped local rules. They do
not run a classifier or open a browser. No model runs during evaluation.

| AMI split | Input | Meetings | Precision | Recall | F1 | False cards/h | Outcome right (cards scored) | First card, median / p90 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tune | Manual | 11 | 0.515 | 0.714 | 0.598 | 36 | 0.767 (210) | 2.3 / 11.0 s |
| Tune | Plain | 11 | 0.632 | 0.491 | 0.553 | 13 | 0.783 (120) | 2.6 / 13.2 s |
| Tune | small.en, quiet | 11 | 0.435 | 0.497 | 0.464 | 40 | 0.819 (166) | 1.4 / 5.9 s |
| Test | Manual | 12 | 0.547 | 0.740 | 0.629 | 36 | 0.824 (279) | 1.5 / 11.5 s |
| Test | Plain | 12 | 0.593 | 0.460 | 0.518 | 16 | 0.847 (144) | 2.6 / 14.6 s |
| Test | small.en, quiet | 8 | 0.467 | 0.483 | 0.475 | 34 | 0.843 (121) | 1.3 / 4.9 s |
| Test | small.en, steady | 8 | 0.322 | 0.224 | 0.264 | 30 | 0.807 (57) | 0.5 / 3.4 s |
| Test | Parakeet Ultra with context, quiet | 12 | 0.498 | 0.642 | 0.561 | 44 | 0.881 (278) | 1.1 / 5.7 s |
| Test | Parakeet Ultra with context, steady | 12 | 0.435 | 0.443 | 0.439 | 43 | 0.858 (212) | 0.4 / 2.8 s |
| Test | Parakeet Ultra without context, quiet | 12 | 0.462 | 0.594 | 0.519 | 43 | 0.843 (235) | 1.2 / 5.8 s |
| Test | Parakeet Ultra without context, steady | 12 | 0.367 | 0.397 | 0.381 | 43 | 0.816 (158) | 0.4 / 2.7 s |

The recognition caches do not contain tuning runs for small.en in steady sound
or for Parakeet in either room. The quiet small.en tuning runs come from the
older question evaluation cache. The engines have different test cohorts, so
do not use these rows to rank the engines. Parakeet Ultra trained on AMI.

- Check 1 uses the strict AMI labels. False cards are cards that do not match
  these labels, not necessarily statements that a listener would reject.
  The command prints 95% meeting-bootstrap intervals for precision, recall
  and F1. See [the scoring rules](question-eval.md#the-scores).
- First-card delay starts at the end of the matched AMI question. Manual and
  plain use the same simulated pause cuts. Recognition uses cached final
  times and request times. These are replay figures, not screen timings.
- Check 2 compares the final state of matched cards with cached reader
  judgments. An uncertain state counts as right for an answer or a denial.
  An asked or silence state counts as right for an open question. The
  denominator does not include missed questions or false cards.
- The test runs simulate one search in small.en quiet and none in steady.
  Parakeet with context simulates seven in quiet and three in steady.
  Parakeet without context simulates five in quiet and three in steady.
  Each search follows a reply that matches the evaluator's unknown pattern.
- The evaluator does not measure reply-to-verdict delay in this baseline.
  Use the same timing method on this base and on the sentence reply change
  when that probe is available.

### Commands

From the repository root at the base revision:

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
cache="$HOME/oats-asr-cache"
base() {
  node scripts/question-eval.mjs baseline --ami "$cache/AMI" --only app \
    --reader "$cache/question-eval/reader/openai_gpt-6.1-terra@none.jsonl" "$@"
}
base --split tune
base --split test
base --split tune --replays "$cache/question-eval/replays" --replay small.en__quiet-room
for engine in small.en parakeet-ultra-context parakeet-ultra; do
  for room in quiet-room steady-sound; do
    base --split test --replays "$cache/replays" --replay "${engine}__${room}"
  done
done
```

The default virtual speech hold stays on. The speech activity contract supports
it independently of partial text. Print only aggregate results from the test
split. The `--reader` flag reads a file and makes no requests.

## SR-1: sentence ends versus dialogue-act ends

Score exact word ends on manual text in the simulated room finals.
Include every dialogue act with words. Count the end of each final even
if it has no punctuation: a sentence does not carry over to the next final.

| AMI split | Precision | Recall | F1 | Punctuation-only ceiling |
| --- | ---: | ---: | ---: | ---: |
| Tune | 0.845 | 0.691 | 0.760 | 0.781 |
| Test | 0.848 | 0.703 | 0.769 | 0.789 |

The ceiling credits every gold end on a token with an end mark or at the
end of a final. It removes every other break except the final ends. On test,
2,553 of 8,594 gold ends cannot be reached by that rule, and 680 finals end
at a different word. The 0.90 gate cannot pass under both constraints.

Typical split time was about 0.001 ms per sentence in these runs. In one
sequential run the longest whole-final split, including the cold start, took
0.52 ms. In a concurrent run one whole-final split took 2.36 ms wall time.

```sh
node scripts/question-eval.mjs boundaries --split tune
node scripts/question-eval.mjs boundaries --split test
node --test test/helpers/sentenceSplit.test.js test/helpers/conversationAide.test.js
```

The record-only change preserves the question baseline. Compare JSON output
from each LM-0 command with the default aide and with `--aide` set to the aide
from `7337403`, with its relative `contextCheck.mjs` import resolved. All nine
command pairs produced identical JSON, including per-meeting scores and
outcome counts.
