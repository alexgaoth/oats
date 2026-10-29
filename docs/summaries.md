# Summaries, measured

Question (Alex, 2026-10-28): how good are the summaries Oats writes at Finish,
and which writing model should each Mac and each provider get by default?

This page has the answer, the numbers, how they were measured, and the
decisions that are Alex's. Every number comes from `scripts/summary-eval.mjs`
on public data (the AMI meeting corpus, CC BY 4.0). No recorded conversation
of a person was sent anywhere.

## The answer

- **The best summaries come from Claude Opus 5.5** (effort medium, its
  default): it states 85% of the decisions, actions and problems the AMI
  annotators wrote down, invents 0.75 facts in a summary, and the judge rates
  it 4.96 of 5 as a record. Claude Sonnet 5.5 covers as much and invents a
  little more.
- **For OpenAI, gpt-6.1-sol** is as good as gpt-6-astra at reasoning low (73
  to 74% covered, 0.5 to 0.7 invented facts) at a fifth of the price, and
  better than the app's cloud default, gpt-5.6-terra, which invents 3.0 facts
  in every summary. More reasoning does not buy a better summary, for any model.
- **No model on this Mac writes summaries good enough to be a default.** Six
  were measured, from LFM2.5 1.2B to GPT-OSS 20B. The most accurate, Gemma 4
  E4B, invents 1.7 facts in a summary (gpt-6.1-sol: 0.8 in the same batch) but
  states only 54% of what the annotators wrote down (gpt-6.1-sol: 78%).
  Qwen3.5 9B states 69% and invents 5.0; GPT-OSS 20B 54% and 5.5; Qwen3.5 4B,
  the model the app picks for "on this Mac" today, 59% and 5.7. So no Mac gets
  a local writing model by default, and the first run downloads none (D2: no).
- **What the room heard matters more than the model.** In a quiet room
  (`small.en`, WER 31%) most models lose 0 to 16 points of coverage. With
  steady sound (WER 61%) most lose 32 to 47 points, and the models invent 2 to
  5.5 more facts.
- **The app loses summaries today.** The Anthropic route fails on every current
  Claude model (#133), OpenAI's 30 s limit stops gpt-5.5-pro every time, an
  empty answer is saved as the summary in the transcript's place, and a
  conversation longer than 56 to 95 minutes (by how busy it is) does not fit
  the local model's context. #139 fixes the second and the third, and makes the
  fourth fail loudly.
- **The prompt invents decisions and guesses who will act.** It says the
  transcript has "You:" and "Them:" labels; a room's has none. #142 tells the
  model what it gets: the models invent fewer facts (gpt-5.6-terra: 3.0 → 0.8)
  and write no "You"/"Them" guess, for a few points of coverage.

## Decisions for Alex

1. **OpenAI's default writing model: gpt-6.1-sol**, in place of gpt-5.6-terra
   (`DEFAULT_CLOUD_MODEL`, `components/settings/processing.ts`). It is not in
   the model registry yet. gpt-6-astra at reasoning low writes summaries as
   good, for five times the price ($0.10 a summary against $0.02); at reasoning
   high it covers 2 to 4 points more (not significant) for $0.13. gpt-5.5-pro
   is no better and never finishes inside the app's limit. If topic names keep
   gpt-6-astra (`alex/remote-content`), the summary job can still use
   gpt-6.1-sol once the per-job models land. Done: #144.
2. **Anthropic's default: Claude Opus 5.5 at effort medium**, after #133
   (none of the Claude 5.5 models is in the registry). Claude Sonnet 5.5 is
   the cheaper choice at half the price; let it think for a summary: with
   thinking off, as #133 sends it under the "disable thinking" setting, it
   invents 0.5 to 1.1 more facts. Not Claude Haiku 5.5: 3.2 invented facts in a
   summary. Done: #145.
3. **Bedrock is not a writing route** (`PROVIDER_REGISTRY` has no `bedrock`,
   and Settings does not offer it). If it becomes one: GLM 5 (73% covered, 1.9
   invented, $0.009). DeepSeek V3.2 and Amazon Nova 2 Lite are worse, and the
   Claude models this account can reach on Bedrock stop at Haiku 4.5.
4. **Superseded on 2026-10-29 (Alex's review of 0.2):** "On this Mac" now
   downloads a writing model by itself when none is ready: Gemma 4 E4B with
   16 GB of memory or more, Qwen3.5 4B under that (decision 7 below,
   `src/helpers/writingTier.mjs`), chosen in setup or after it. The decision
   as it was taken: **No local writing model by default, on any Mac, and D2
   (download one at first run): no.** Decided 2026-10-28 (Alex delegated it), after measuring
   all six models. None clears the bar, which was set before the results: at
   most 1.2 invented facts in a summary and at least 65% covered ("The rule for
   a default" below). A first-run download (3 to 12 GB) would give every new
   user summaries with 1.7 to 5.7 invented facts. A person who wants summaries
   on this Mac chooses a model in Settings, as today. Measure again when a new
   local model comes out: `summary-eval.mjs` runs one in about 25 minutes of
   GPU and $1.20 of judging.
5. **The prompt (#142)**: fewer invented facts and no "You"/"Them" guesses, for
   3 to 4 points of coverage with most models and 5 to 9 with gpt-6-luna.
   Done: #142.
6. **Long conversations on this Mac.** The local server's context is 16,384
   tokens (`modelManagerBridge.js`). About 14,700 tokens of transcript fit: 56
   minutes of the busiest meeting, 76 at the median pace, 95 at a slow one.
   Longer, the answer is cut, and since #139 the summary fails and says so. Not
   fixed here, because no Mac got a local default; since 2026-10-29 every Mac
   on "On this Mac" does (decision 4), so this now meets every one of them. A context sized to the transcript for the summary
   (the models were trained on 128K to 262K tokens), or a summary written in
   parts, would fix it.
7. **The model that "on this Mac" picks (`DEFAULT_LOCAL_MODEL`: Qwen3.5 4B, on
   every Mac).** Done 2026-10-29: Gemma 4 E4B with 16 GB or more, Qwen3.5 4B
   under that (`src/helpers/writingTier.mjs`); its dictation cleanup is still
   not measured. On the same 24 meetings Gemma 4 E4B invents 4.0 fewer facts in
   a summary [3.0, 5.1] (second judge: 5.2 fewer), for 4.9 points less
   coverage [−11.3, +1.2] (second judge: 7.0, [−13.5, −0.8]). It needs a 16 GB
   Mac (6.8 GB at its peak), and the same model also cleans dictation
   (`selectResolvedLLMConfig`), which was not measured with it. Proposed:
   measure Gemma 4 E4B's dictation cleanup, then make it the choice on Macs
   with 16 GB or more. On 8 GB, Qwen3.5 4B (5.6 GB at its peak) takes more
   than half the memory.

## What the app does today

| route | what happens at Finish |
| --- | --- |
| Anthropic | Every current Claude model refuses the request (HTTP 400, `temperature`), and an answer that starts with a thinking block breaks `content[0].text`: **no summary**. Only Claude Sonnet 4.6, Haiku 4.5 and older work. #133 fixes both, gives Claude 4.7 and later at least 16,000 output tokens, and fails a cut answer. |
| OpenAI | 30 s an attempt and 4,096 output tokens. gpt-5.5-pro took 95 to 99 s: **no summary, ever**, after four attempts. 7 of its 24 answers were cut at 4,096; 4 had no text, and an empty answer returns the request's input, so **the transcript was saved as the summary**. Every other OpenAI model finished in 25 s or less, even for 98 minutes (gpt-6-astra at reasoning high: 27 s at the 95th percentile). #139 gives the summary 180 s and 16,000 tokens and never saves a cut or empty answer. |
| On this Mac | No model at all on a fresh install; choosing "on this Mac" picks Qwen3.5 4B on every Mac (`DEFAULT_LOCAL_MODEL`). With a model: 2,048 output tokens and a 16,384-token context. Qwen3.5 2B rambled to the 2,048 limit once in 88 summaries; GPT-OSS 20B reasons first inside the same limit and was cut in 2 of 40; a 98-minute conversation fills the context. GPT-OSS 20B could not be downloaded at all: the registry's file name answers HTTP 404 since 2026-07-16 (#148). |
| Bedrock | Not a writing route. |

## Quality per model

All numbers below are means over the inputs with a 95% bootstrap interval.
"Covered" is the share of the annotators' decisions, actions and problems that a
summary states (the judges also scored the abstract's sentences; they rank the
configurations nearly the same way, Spearman 0.89). "Invented
facts" counts the claims the manual transcript does not support. "Useful" is
the judge's 1-to-5 rating of the summary as a record of the meeting. The first
judge is Claude Fable 5.1, the second gpt-6.1-sol (its numbers in one column).
Cost is the standard-tier price of the summary and its title; latency is one
summary request, from this Mac.

### The manual transcripts (24 meetings)

| model | n | covered % | invented facts | useful | 2nd judge: covered %, invented, useful | "You"/"Them" lines | p50 / p95 s | $ a summary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-luna | 24/24 | 69 [58, 78] | 0.38 [0.17, 0.62] | 3.75 [3.58, 3.92] | 74, 1.12, 4.04 | 1.7 | 14 / 19 | 0.0013 |
| gpt-5.6-luna | 24/24 | 72 [62, 80] | 3.83 [3.12, 4.58] | 3.71 [3.54, 3.88] | 77, 4.12, 3.62 | 4.9 | 12 / 14 | 0.0028 |
| **gpt-5.6-terra (the cloud default)** | 24/24 | 78 [68, 87] | 3.00 [2.25, 3.83] | 3.92 [3.75, 4.08] | 81, 3.50, 3.83 | 5.7 | 14 / 17 | 0.0263 |
| **gpt-6.1-sol** | 24/24 | 73 [63, 82] | 0.67 [0.42, 0.92] | 4.17 [3.96, 4.38] | 80, 0.79, 4.50 | 0.0 | 15 / 19 | 0.0212 |
| gpt-6.1-sol, reasoning low | 24/24 | 74 [63, 83] | 0.58 [0.21, 1.12] | 4.21 [4.00, 4.46] | 80, 0.92, 4.54 | 0.0 | 18 / 22 | 0.0205 |
| gpt-6-astra, reasoning low | 24/24 | 73 [65, 82] | 0.46 [0.21, 0.75] | 4.21 [4.00, 4.42] | 80, 0.75, 4.38 | 0.0 | 17 / 19 | 0.1039 |
| gpt-6-astra, reasoning high | 24/24 | 77 [67, 87] | 0.54 [0.25, 0.83] | 4.38 [4.17, 4.58] | 82, 0.71, 4.54 | 0.0 | 17 / 27 | 0.1342 |
| gpt-5.5-pro | 20/24 | 75 [63, 86] | 1.75 [1.20, 2.30] | 4.00 [3.65, 4.30] | 77, 1.75, 4.00 | 1.9 | 97 / 99 | 0.8519 |
| Claude Haiku 5.5, thinking off | 24/24 | 75 [65, 85] | 3.21 [2.71, 3.75] | 3.75 [3.46, 4.00] | 74, 4.25, 3.58 | 2.2 | 7 / 9 | 0.0016 |
| Claude Haiku 5.5, thinking on | 24/24 | 68 [56, 79] | 3.46 [2.79, 4.17] | 3.50 [3.17, 3.79] | 70, 5.00, 3.25 | 1.5 | 11 / 18 | 0.0020 |
| Claude Sonnet 5.5, thinking off | 24/24 | 83 [74, 90] | 1.67 [1.25, 2.04] | 4.71 [4.54, 4.88] | 82, 3.08, 4.00 | 2.3 | 8 / 8 | 0.0348 |
| Claude Sonnet 5.5, thinking on | 24/24 | 86 [77, 93] | 1.21 [0.92, 1.54] | 4.75 [4.58, 4.92] | 86, 2.12, 4.21 | 1.6 | 17 / 25 | 0.0417 |
| **Claude Opus 5.5 (effort medium)** | 24/24 | 85 [76, 93] | 0.75 [0.50, 1.04] | 4.96 [4.88, 5.00] | 86, 1.67, 4.25 | 0.6 | 21 / 30 | 0.0892 |
| Claude Opus 5.5, effort high | 24/24 | 87 [77, 93] | 0.75 [0.42, 1.17] | 4.75 [4.58, 4.92] | 83, 1.71, 4.38 | 0.4 | 22 / 41 | 0.0993 |
| Bedrock Amazon Nova 2 Lite | 24/24 | 48 [38, 59] | 3.50 [2.79, 4.29] | 2.62 [2.42, 2.79] | 46, 3.33, 2.96 | 3.8 | 4 / 16 | 0.0036 |
| Bedrock DeepSeek V3.2 | 24/24 | 67 [56, 77] | 1.67 [1.21, 2.17] | 3.54 [3.33, 3.75] | 67, 1.83, 3.75 | 2.2 | 17 / 34 | 0.0055 |
| Bedrock GLM 5 | 24/24 | 73 [62, 83] | 1.88 [1.33, 2.46] | 4.00 [3.75, 4.21] | 72, 2.46, 3.71 | 3.2 | 11 / 14 | 0.0090 |
| LFM2.5 1.2B, this Mac | 24/24 | 8 [3, 13] | 7.54 [6.79, 8.33] | 1.75* | 12, 7.62, 2.04 | 0.6 | 4 / 7 | 0 |
| Qwen3.5 2B, this Mac | 24/24 | 47 [37, 58] | 11.00 [9.67, 12.46] | 2.29* | 47, 13.88, 2.29 | 1.5 | 12 / 16 | 0 |

\* Graded in a later batch, beside weaker summaries: "useful" moved up by 0.8
for the same summaries in that batch (see "The judges"), so compare these two
rows on coverage and invented facts only.

Thinking off is how #133 sends Claude Haiku 5.5 and Sonnet 5.5 under the
writing model's default "disable thinking"; thinking on is the API's default.
Every Claude row is the request without temperature. gpt-5.5-pro's 4 missing
summaries are answers cut with no text (see above); its latency is the standard
tier's (the quality runs used Flex). By category, Claude Opus 5.5 states 87% of
the decisions, 68% of the actions and 81% of the problems; gpt-6.1-sol 77%, 55%
and 78%; gpt-5.6-terra 81%, 66% and 69%.

### The models on this Mac (24 meetings, the prompt as shipped)

Six local models with the app's request and the prompt as shipped (#142). The
four larger ones were graded in their own batch, beside gpt-6.1-sol's 24
summaries graded a second time as an anchor; LFM2.5 1.2B and Qwen3.5 2B with
#142's prompt in the batch before.

| model | n | covered % | invented facts | useful | 2nd judge: covered %, invented, useful | p50 / p95 s | memory at its peak |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LFM2.5 1.2B | 24/24 | 12 [6, 18] | 5.75 [4.83, 6.67] | 1.83* | 13, 5.67, 2.12 | 5 / 6 | about 1.3 GB |
| Qwen3.5 2B | 24/24 | 44 [32, 55] | 10.79 [9.67, 11.96] | 2.42* | 44, 12.83, 2.25 | 11 / 13 | about 2.5 GB |
| Qwen3.5 4B (today's choice for "on this Mac") | 24/24 | 59 [49, 69] | 5.71 [4.79, 6.62] | 3.29 | 59, 6.58, 3.00 | 25 / 31 | 5.6 GB |
| **Gemma 4 E4B** | 24/24 | 54 [45, 64] | **1.71 [1.25, 2.21]** | 3.54 | 52, 1.38, 3.62 | 19 / 23 | 6.8 GB |
| Qwen3.5 9B | 24/24 | **69 [59, 80]** | 4.96 [4.12, 5.75] | 3.46 | 70, 5.67, 3.25 | 35 / 44 | 8.7 GB |
| GPT-OSS 20B | 23/24 | 54 [44, 63] | 5.52 [4.30, 6.70] | 2.87 | 55, 6.35, 2.87 | 28 / 42 | 13.2 GB |
| gpt-6.1-sol, the anchor (graded again in this batch) | 24/24 | 78 | 0.83 | 4.75 | 80, 0.88, 4.71 | 15 / 19 | |

\* In the batch before, beside the cloud models' rows; compare "useful" only
within a batch.

- **None clears the bar** (at most 1.2 invented facts and at least 65%
  covered). Gemma 4 E4B is the only local model near the cloud models on
  invented facts, and with GPT-OSS 20B it states the least of the four larger
  ones.
- **Against Qwen3.5 4B, on the same meetings:** Gemma 4 E4B invents 4.0 fewer
  facts [3.0, 5.1] and covers 4.9 points less [−11.3, +1.2]; Qwen3.5 9B covers
  10.1 points more [2.4, 18.3] and invents 0.75 fewer [−0.1, 1.5]; GPT-OSS 20B
  is no different (−4.0 points, −0.13 facts, both intervals across zero).
- What they invent: actions nobody took on ("Schedule a follow-up meeting to
  review updated budget"), numbers ("current cost estimate (~€8.8 k)"), and
  reasons or agreements the meeting did not state.
- GPT-OSS 20B reasons before it answers (about 500 tokens, 140 to 1,000), at
  its chat template's default effort, medium, inside the app's 2,048 output
  tokens: 1 of its 24 summaries was cut there (and 1 of the 16 from the rooms),
  which the app now fails (#139).
- The anchor moved between batches: 73 → 78% covered, 0.67 → 0.83 invented,
  4.17 → 4.75 useful (second judge: 80 → 80%, 0.79 → 0.88, 4.50 → 4.71). So the
  local models are 9 to 24 points of coverage and 0.9 to 4.9 invented facts
  behind gpt-6.1-sol in their own batch.

### As the app heard the room (8 meetings, two rooms)

| model | covered % | invented facts | useful | 2nd judge: covered %, invented, useful |
| --- | --- | --- | --- | --- |
| gpt-6-luna | 48 [34, 61] | 1.81 [1.00, 2.69] | 2.88 [2.50, 3.25] | 45, 3.12, 3.06 |
| gpt-5.6-luna | 51 [36, 66] | 5.50 [4.12, 6.94] | 3.19 [2.81, 3.56] | 61, 8.25, 2.75 |
| gpt-5.6-terra (the cloud default) | 57 [43, 69] | 5.31 [4.12, 6.69] | 3.25 [2.88, 3.62] | 59, 6.75, 3.12 |
| gpt-6.1-sol | 54 [42, 67] | 1.94 [1.25, 2.69] | 3.38 [3.00, 3.69] | 58, 2.81, 3.44 |
| gpt-6.1-sol, reasoning low | 61 [45, 75] | 2.00 [1.31, 2.69] | 3.38 [2.94, 3.75] | 61, 3.25, 3.62 |
| gpt-6-astra, reasoning low | 62 [48, 75] | 1.56 [0.75, 2.56] | 3.69 [3.31, 4.06] | 64, 3.25, 3.44 |
| Claude Haiku 5.5, thinking off | 42 [28, 56] | 4.81 [3.69, 6.00] | 2.94 [2.56, 3.31] | 51, 6.19, 2.81 |
| Claude Sonnet 5.5, thinking off | 61 [46, 74] | 4.81 [3.44, 6.31] | 3.31 [2.81, 3.75] | 63, 6.56, 3.00 |
| Claude Sonnet 5.5, thinking on | 63 [49, 76] | 3.94 [2.56, 5.56] | 3.50 [3.00, 3.94] | 66, 5.31, 3.12 |
| Claude Opus 5.5 | 67 [55, 80] | 2.94 [1.81, 4.12] | 3.94 [3.50, 4.38] | 73, 4.31, 3.50 |
| Bedrock GLM 5 | 47 [35, 58] | 4.88 [3.88, 6.00] | 3.00 [2.62, 3.38] | 56, 5.12, 2.94 |
| Qwen3.5 2B, this Mac | 21 [11, 32] | 10.31 [9.44, 11.25] | 1.88* | 29, 15.56, 1.56 |
| LFM2.5 1.2B, this Mac | 5 [0, 12] | 6.06 [4.94, 7.25] | 1.38* | 6, 7.00, 1.69 |
| Qwen3.5 4B, this Mac (#142's prompt) | 47 [33, 60] | 8.06 [6.56, 9.62] | 2.44† | 39, 9.69, 2.19 |
| Gemma 4 E4B, this Mac (#142's prompt) | 33 [23, 42] | 3.62 [2.56, 4.81] | 2.75† | 36, 3.38, 2.81 |
| Qwen3.5 9B, this Mac (#142's prompt) | 53 [40, 66] | 7.56 [5.94, 9.00] | 2.62† | 59, 8.12, 2.50 |
| GPT-OSS 20B, this Mac (#142's prompt; 15 of 16, 1 cut) | 35 [23, 46] | 7.00 [5.47, 8.53] | 2.33† | 36, 7.13, 2.20 |

† The local models' batch (above): compare "useful" only within a batch.

16 inputs each: the 8 far-field meetings in the quiet room and with steady
sound. Against the same meeting's manual transcript (Claude Fable 5.1, paired):

| model | covered, quiet room | covered, steady sound | invented, quiet room | invented, steady sound |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 | −1.9 [−13.1, 7.2] | −44.1 [−54.5, −32.6] | +0.50 [−0.25, 1.38] | +3.88 [2.50, 5.38] |
| Claude Sonnet 5.5, thinking on | −12.5 [−22.8, −3.1] | −47.0 [−64.4, −24.9] | +1.38 [0.25, 2.38] | +4.00 [1.75, 6.50] |
| gpt-6.1-sol | −2.8 [−11.9, 6.6] | −33.9 [−51.9, −11.7] | +1.13 [0.25, 2.00] | +1.75 [0.88, 2.75] |
| gpt-6-astra, reasoning low | −4.1 [−11.9, 3.1] | −36.8 [−51.4, −19.6] | +0.63 [0.13, 1.13] | +2.25 [1.00, 3.63] |
| gpt-5.6-terra | −4.6 [−19.7, 9.4] | −41.1 [−59.4, −22.4] | +0.50 [−0.25, 1.38] | +3.38 [1.63, 5.38] |
| Qwen3.5 2B, this Mac | −22.4 [−43.2, 1.0] | −38.0 [−57.8, −18.1] | −0.75 [−3.13, 1.13] | −0.63 [−3.25, 1.75] |
| Qwen3.5 4B, this Mac | +0.3 [−12.2, 13.0] | −34.7 [−56.9, −12.8] | +1.00 [−0.25, 2.50] | +4.38 [2.62, 6.25] |
| Gemma 4 E4B, this Mac | −7.3 [−16.9, 2.1] | −31.9 [−45.3, −18.3] | 0.00 [−1.12, 1.12] | +3.75 [2.25, 5.38] |
| Qwen3.5 9B, this Mac | −3.4 [−17.2, 14.4] | −40.3 [−58.3, −24.2] | +2.62 [1.12, 3.88] | +5.50 [3.25, 7.62] |
| GPT-OSS 20B, this Mac (7 and 6 pairs) | −0.4 [−5.4, 4.3] | −18.3 [−41.7, 5.0] | +1.00 [−1.43, 3.57] | +4.50 [1.67, 7.33] |

- **The quiet room costs little**: most models lose 0 to 16 points, inside the
  noise for most of them (Qwen3.5 2B: 22).
- **Steady sound halves what a summary covers**, whatever the model: 40% of the
  words come back (`docs/dictation-accuracy.md`), and the models fill the gaps
  with guesses (2 to 5.5 more invented facts). gpt-6.1-sol and gpt-6-astra
  guess least; of the local models, Gemma 4 E4B invents the fewest in the
  rooms (3.6 a summary). The loss is the recognition's: `large-v3-turbo`
  recovers 47.5% of the words in this room, against 40.0% for `small.en`
  (summaries from it were not measured).

### Effort and thinking

The same model with more effort, on the same inputs (difference, first judge /
second judge):

| change | covered, points | invented facts | useful | p50 / p95 s | $ a summary |
| --- | --- | --- | --- | --- | --- |
| Claude Opus 5.5, medium → high | +1.1 / −2.5 | 0.00 / +0.04 | −0.21 / +0.13 | 21 / 30 → 22 / 41 | 0.089 → 0.099 |
| gpt-6-astra, low → high | +3.8 / +2.0 | +0.08 / −0.04 | +0.17 / +0.17 | 17 / 19 → 17 / 27 | 0.104 → 0.134 |
| gpt-6.1-sol, default → low | +3.3 / +1.4 | −0.03 / +0.25 | +0.03 / +0.10 | 15 / 19 → 18 / 22 | 0.021 → 0.021 |
| Claude Sonnet 5.5, thinking off → on | +2.8 / +3.1 | **−0.63 / −1.07** | +0.10 / +0.17 | 8 / 8 → 17 / 25 | 0.035 → 0.042 |
| Claude Haiku 5.5, thinking off → on | −2.7 / +0.3 | +0.28 / **+0.78** | −0.07 / −0.25 | 7 / 9 → 11 / 18 | 0.0016 → 0.0020 |

Bold: the interval excludes zero. More effort or reasoning changes nothing
measurable at Finish, except that Claude Sonnet 5.5 invents less when it may
think, and Claude Haiku 5.5 more. A summary can wait, but it gains nothing by
waiting.

### The prompt (#142)

The same 40 inputs per model, the app's prompt (`origin/main`) against #142
(`--prompt-ref alex/summary-prompt`):

| model | invented facts | covered, points | "You"/"Them" lines |
| --- | --- | --- | --- |
| gpt-5.6-terra | **−2.23 / −2.42** | −2.8 / −4.1 | 5.8 → 0 |
| Claude Haiku 5.5, thinking on | **−0.85 / −0.88** | +0.5 / −1.3 | 1.4 → 0 |
| gpt-6-luna | −0.23 / **−1.02** | **−8.8 / −4.7** | 1.4 → 0 |
| LFM2.5 1.2B | **−1.57 / −1.68** | +2.3 / −0.4 | 0.4 → 0 |
| Qwen3.5 2B | −0.13 / −0.85 | −3.5 / −3.5 | 1.9 → 0 |

(first judge / second judge; bold: the interval excludes zero). For
gpt-5.6-terra most of what the judges counted as invented with the old prompt
was the prompt's own doing: "Decision: ... (no decision was made)", "Action:
... (nobody took this on)", and 51 of its 157 were an item given to "You" or
"Them".

### The judges

Two judges graded all 1,065 summaries, each blind (a random four-letter id, no
model name), shuffled per meeting, in groups of 8, in three batches: the cloud
models, the two small local models, the four larger ones.

- **They agree.** Per summary, coverage correlates at r = 0.90, invented facts
  at 0.89 and usefulness at 0.84. Over the 28 configurations they rank coverage
  the same (Spearman 0.99) and invented facts nearly so (0.96).
- **Family bias, small and on the subjective scores.** Coverage shows none (the
  second judge is 2 to 4 points higher for every family). gpt-6.1-sol counts
  0.7 more invented facts for Claude summaries than for OpenAI ones, relative
  to Claude Fable 5.1, and rates Claude's usefulness 0.5 lower. A Claude summary
  ranks first under both judges on coverage.
- **Repeatability.** 40 summaries (gpt-6-luna) were graded again in the second
  batch: coverage moved 8.6 points per summary on average (r = 0.85) and
  invented facts 0.4 (r = 0.88), with little shift in the means (60 → 63%,
  0.95 → 1.18). The 1-to-5 scores did shift: usefulness 3.40 → 4.20 and the
  title 3.60 → 4.22, beside the weaker local summaries of that batch. In the
  third batch gpt-6.1-sol's 24 summaries of the manual transcripts were the
  anchor: coverage moved 5.9 points per summary (r = 0.89), the means 73 → 78%
  and 0.67 → 0.83 invented facts, usefulness 4.17 → 4.75. So usefulness and
  the title compare only within a batch; coverage and invented facts compare
  across batches to within about 5 points and 0.2 facts.

## On this Mac: speed and memory

Apple M5 Pro (16-core GPU, 48 GB), the app's llama-server (b9763) with its
arguments and environment, a fresh prompt each time, each conversation twice.
"Memory" is the server's resident memory at its largest: the model file's pages
the GPU has read and the server's own memory (KV cache, compute buffers).

| model | file | 30 min | 49 min | 60 min | 98 min | writing | reading | memory |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LFM2.5 1.2B | 0.7 GB | 4 s | 7 s | 5 s | cut: context full | 156 to 201 tokens/s | 2,300 to 4,200 tokens/s | about 1.3 GB* |
| Qwen3.5 2B | 1.4 GB | 12 s | 14 s | 15 to 17 s | cut: context full | 94 to 104 tokens/s | 2,300 to 3,400 tokens/s | about 2.5 GB* |
| Qwen3.5 4B | 3.0 GB | 21 to 22 s | 29 to 31 s | 28 s | cut: context full | 44 to 48 tokens/s | 860 to 1,070 tokens/s | 5.6 GB |
| Gemma 4 E4B | 5.4 GB | 18 to 19 s | 25 s | 22 to 23 s | cut: context full | 40 to 48 tokens/s | 850 to 1,100 tokens/s | 6.8 GB |
| Qwen3.5 9B | 6.2 GB | 32 to 34 s | 38 to 47 s | 45 to 49 s | cut: context full | 29 to 31 tokens/s | 570 to 710 tokens/s | 8.7 GB |
| GPT-OSS 20B | 12.1 GB | 25 to 26 s | 28 to 31 s | 31 to 46 s | cut: context full | 51 to 57 tokens/s | 680 to 870 tokens/s | 13.2 GB |

\* The file and the largest footprint (`footprint`), measured before the
resident memory was: LFM2.5 1.2B 0.7 + 0.6 GB, Qwen3.5 2B 1.4 + 1.1 GB.

- The conversations: IS1009c (30 minutes, about 6,200 tokens), IB4010 (49
  minutes, 13,500, the busiest of the 24), TS3003a and b (60 minutes, 9,900)
  and TS3003a to c (98 minutes, 15,700).
- Every summary that fits finishes in under a minute here, inside the app's
  300 s limit. Qwen3.5 4B reads the prompt about 3 times slower than Qwen3.5
  2B, and 9B about 4 times: for them the reading is a third to half of the time.
- **The 98-minute conversation fits no model.** The 16,384-token context holds
  the system prompt (about 640 tokens), the transcript and the answer (300 to
  1,250 tokens). About 14,700 tokens of transcript fit: 56 minutes at the pace
  of IB4010 (263 tokens a minute), 76 at the median pace of the 24 meetings
  (194), 95 at the pace of TS3003 (155). Since #139 such a summary fails and
  says so; before, the cut answer was saved.
- One of Qwen3.5 2B's eight timing runs rambled to the 2,048-token limit (22 s,
  cut). GPT-OSS 20B's writing includes its reasoning (about 500 tokens): the
  60-minute conversation took it 1,064 and 1,843 tokens, and 2 of its 40 eval
  summaries reached the limit. No other model reached it.

### The rule for a default, and what it picks

The bar was set before the four larger models' results: on the 24 manual
transcripts with the prompt as shipped, graded by Claude Fable 5.1, **at most
1.2 invented facts in a summary** (the cloud defaults: 0.67 and 0.75), **at
least 65% covered** (gpt-6.1-sol: 73% [63, 82]), and every summary complete.
Per Mac, from `deviceTier()` (#141), a model that clears it must also fit and
be fast enough:

- **Memory**: its peak (the table above) is at most half of
  `device.memoryBytes`. The other half is for the speech model, the app and
  macOS.
- **Time**: its 60-minute time here, scaled by how much slower the Mac reads
  `deviceTier()`'s clip than this one (`smallClipMs` / 160 ms, as #141 scales
  turbo), is at most 150 s, half the local server's 300 s limit.
- Of the models left, the one that invents the fewest facts.

| memory | models that fit | slowest clip time for the 150 s | clears the bar | default |
| --- | --- | --- | --- | --- |
| 8 GB | LFM2.5 1.2B, Qwen3.5 2B | 4,800 and 1,400 ms | none | none |
| 16 GB | and Qwen3.5 4B, Gemma 4 E4B | 860 and 1,040 ms | none | none |
| 18 to 24 GB | and Qwen3.5 9B | 490 ms | none | none |
| 32 GB or more | and GPT-OSS 20B | 520 ms | none | none |

So the rule picks no model on any Mac, and the first run downloads none. If a
model clears the bar later, the same rule places it, and it downloads after
setup behind the notice and Cancel of #141's turbo download.

## Remote: time and cost

| model | 60 min (9,200 tokens) | 98 min (14,600 tokens) |
| --- | --- | --- |
| gpt-6-luna | 18.8 s | 20.2 s |
| gpt-5.6-luna | 14.6 s | 18.7 s |
| gpt-5.6-terra | 13.7 s | 18.3 s |
| gpt-6.1-sol | 18.6 s | 20.7 s |
| gpt-6-astra, reasoning low | 21.7 s | 25.1 s |
| Claude Haiku 5.5, thinking on | 15.4 s | 14.4 s |
| Claude Sonnet 5.5, thinking on | 21.3 s | 25.5 s |
| Claude Opus 5.5 | 31.5 s | 42.5 s (cut at 4,096 output tokens) |

The token counts are OpenAI's; Claude's tokenizer counts about 1.5 times as
many for the same text. A summary of a 30-minute conversation costs $0.001
(gpt-6-luna) to $0.09 (Claude Opus 5.5); gpt-5.5-pro costs $0.85.

## What the app sends at Finish

`summarizeConversation` (`OatsWorkspace.tsx`) calls `runBackgroundAction`
(`actionProcessingStore.ts`), and then `generateNoteTitle` writes the title.
The eval reads the prompt from the source, so it runs the text that ships:

- **System prompt**: `MEETING_SYSTEM_PROMPT`, then the built-in action's prompt
  that `database.js` seeds ("Transform the provided content into clean,
  well-structured notes ..."). A fresh install has no dictionary, so no suffix.
- **User message**: `## Conversation Transcript`, then the segments' text, a
  blank line between them. **A room's segments have no speaker label at
  Finish**: the speaker pass (`runInRoomSpeakerPass`) runs after it, and
  `speakerLabelKind` gives a segment of speaker `"room"` no label. The prompt
  still says the transcript has "You:" and "Them:" labels.
- **Title**: `generateNoteTitle` on the summary's first 2,000 characters, by the
  same route.
- **The routes** (`ReasoningService.processText`):

| route | request | limits in the app |
| --- | --- | --- |
| On this Mac | llama-server (b9763) with the app's arguments: `--ctx-size` 16,384 (or the model's own, if smaller), 4 threads, all layers on the GPU, `--jinja`; temperature 0.3, `max_tokens` 2,048 for any transcript over 1,024 characters, thinking off | 300 s a request |
| OpenAI | Responses API, `store: false`, `max_output_tokens` 4,096, no reasoning effort (the model's default), no temperature for GPT-5 and later | 30 s an attempt, 3 retries; an empty answer returns the **input** (the transcript is saved as the summary) |
| Anthropic | Messages API, `anthropic-version` 2023-06-01, `max_tokens` 4,096, temperature 0.3, the text of `content[0]` | none |
| Bedrock | not a writing route (`PROVIDER_REGISTRY` has no `bedrock`, and Settings does not offer it) | |

## How it was measured

### Inputs

- **eval24**: 24 AMI meetings (12.6 hours), the same set as
  `docs/fast-models.md`: the corpus' 12 standard test meetings (ES2004,
  IS1009, TS3003) and 12 others spread over the corpus. Each is the manual
  transcript, cut at pauses as the room segmenter cuts (`topic-corpus.mjs`),
  13 to 49 minutes, 1,100 to 9,500 words.
- **far8 in two rooms**: the 8 meetings recorded with the far-field array
  (ES2004a to d, IS1009a and b, TS3003a and b; 4.0 hours) through the app's room
  path with `small.en` and `en` (`scripts/room-replay.js`, #122): a **quiet
  room** (WER 30.9%, 70.4% of the words recovered) and a room with **steady
  sound** (pink noise, WER 61.0%, 40.0% recovered). Both reproduce
  `docs/dictation-accuracy.md` exactly.
- **Ground truth**: the AMI abstractive summaries
  (`annotations/abstractive/*.abssumm.xml`): an abstract (8.7 sentences a
  meeting), decisions (5.0), actions (1.6) and problems (2.4). "NA" entries are
  dropped.

### The judge

Claude Fable 5.1 (`claude-fable-5-1`, effort medium), the most capable model
available, through the Message Batches API. Per meeting, every summary of it
(every model, every input: manual, quiet room, steady sound) is shuffled and
graded in groups of 8, each under a random four-letter id, with no model name.
The judge reads the **manual** transcript (speaker letters and roles), the
annotators' summary with numbered items, and the candidates. For each
candidate it lists:

- **covered**: the annotators' items whose substance the candidate states;
- **unsupported**: every claim the transcript does not support (invented
  facts, wrong numbers, decisions nobody made, actions nobody took on, a wrong
  person), quoted. Omissions, vague but true statements and the "You"/"Them"
  labels themselves are not counted: the labels are counted apart, by pattern
  (`summary-score.mjs`);
- **useful** (1 to 5) and **title** (1 to 5).

A summary from a far-field transcript is checked against the manual
transcript: what was said, not what was heard.

A second judge, gpt-6.1-sol (reasoning medium, Flex), grades the same
summaries with the same prompt, to show how much a judge favours its own
family. The cloud models' summaries were graded in one batch, LFM2.5 1.2B's and
Qwen3.5 2B's in a second one with 40 of the first batch's summaries graded
again, and the four larger local models' in a third, with gpt-6.1-sol's 24
summaries of the manual transcripts graded again as the anchor (see "The
judges").

### Statistics

Means over inputs with 95% bootstrap intervals (2,000 resamples, over inputs).
Paired differences compare two configurations on the same inputs.

**ROUGE-L is no use here.** Against the annotators' text it stays between 0.136
and 0.173 for every configuration and ranks them against the judges (Spearman
−0.56 with coverage): LFM2.5 1.2B, which covers 8%, scores 0.162, and Claude
Opus 5.5, which covers 85%, 0.146. A short summary shares more of the
abstract's general words. `report` still prints it.

### What this does not show

- **AMI is one kind of conversation**: scenario design meetings in English, four
  people, a remote control, with a plan for the next meeting. A one-to-one,
  a lecture or a dinner has fewer decisions and actions to find.
- **The judges are models.** They agree (r = 0.89 to 0.91 on coverage and
  invented facts) and repeat themselves, but a person did not check their
  verdicts. An "invented fact" is the judge's reading of a 5,000-word transcript.
- **Each summary was written once.** Local models sample at temperature 0.3,
  and GPT-5 and later choose their own; a second run differs.
- **The speaker pass is not in it.** At Finish a room has no labels; the eval
  gives none. A summary written again after the speaker pass sees "Speaker 1:"
  labels.
- **Only this Mac's speed was measured.** Other Macs' times come from the GPU's
  size, not a run.
- **The local models ran with the app's request only**: temperature 0.3,
  thinking off, 2,048 output tokens, and GPT-OSS 20B at its chat template's
  medium reasoning. Low reasoning or more output room may change its summaries
  (not measured). Their dictation cleanup, which uses the same model, was not
  measured either.
- **Latency is from one network**: the remote times include this Mac's link.

### Spend

$58.67 of API calls in all (the ledger, `FM_LEDGER`): $27.39 for the summaries,
titles and timing runs ($11.25 of it gpt-5.5-pro's), $27.03 for the first judge
($4.64 of it the local models' batch), $3.99 for the second ($0.71) and $0.26
for a judge pilot with Claude Opus 5.5. The local models cost no API calls.
Flex and the Batch API ran the dearest models at half price; the tables give
the standard price.

### Reproduce

```sh
# keys for public data only; the ledger stops at FM_BUDGET_USD
export FM_LEDGER=~/.cache/oats/summaries/ledger.jsonl FM_BUDGET_USD=60
A=(--ami ~/oats-asr-cache/AMI --out eval)
R=(--asr quiet=quiet-small.en.json --asr steady=steady-small.en.json)
node scripts/summary-eval.mjs generate --model openai:gpt-6-luna --sets ref,quiet,steady "${A[@]}" "${R[@]}"
node scripts/summary-eval.mjs generate --model anthropic:claude-opus-5-5 --batch --sets ref,quiet,steady "${A[@]}" "${R[@]}"
lockf -k ~/oats-asr-cache/gpu.lock node scripts/summary-eval.mjs generate --model local:qwen3.5-2b-q4_k_m \
  --gguf Qwen_Qwen3.5-2B-Q4_K_M.gguf --llama-server resources/bin/llama-server-darwin-arm64 --sets ref,quiet,steady "${A[@]}" "${R[@]}"
node scripts/summary-eval.mjs judge --judge anthropic:claude-fable-5-1 --batch "${A[@]}"
node scripts/summary-eval.mjs judge --judge openai:gpt-6.1-sol@flex "${A[@]}"
node scripts/summary-eval.mjs report --judge anthropic:claude-fable-5-1 --baseline openai_gpt-5.6-terra \
  --pairs openai_gpt-5.6-terra:openai_gpt-5.6-terra+fix "${A[@]}"
# speed on this Mac: 30, 49, 60 and 98 minutes, twice each, a fresh prompt each time
lockf -k ~/oats-asr-cache/gpu.lock node scripts/summary-eval.mjs speed --model local:qwen3.5-2b-q4_k_m \
  --gguf Qwen_Qwen3.5-2B-Q4_K_M.gguf --llama-server resources/bin/llama-server-darwin-arm64 \
  --ami ~/oats-asr-cache/AMI --meetings IS1009c,IB4010,TS3003a+TS3003b,TS3003a+TS3003b+TS3003c --repeat 2
# the far-field transcripts: docs/dictation-accuracy.md, with --model ggml-small.en.bin --language en
# a prompt from another branch: --prompt-ref alex/summary-prompt --tag fix
# the four larger local models, one GPU-lock hold each (about 25 minutes), then one batch with an anchor:
lockf -k ~/oats-asr-cache/gpu.lock node scripts/summary-eval.mjs generate --model local:gpt-oss-20b-mxfp4 \
  --gguf gpt-oss-20b-MXFP4.gguf --llama-server resources/bin/llama-server-darwin-arm64 --sets ref,quiet,steady \
  --prompt-ref alex/summary-prompt --tag fix "${A[@]}" "${R[@]}"
K=local_qwen3.5-4b-q4_k_m+fix,local_gemma-4-e4b-it-q4_k_m+fix,local_qwen3.5-9b-q4_k_m+fix,local_gpt-oss-20b-mxfp4+fix
node scripts/summary-eval.mjs judge --judge anthropic:claude-fable-5-1 --batch --keys $K \
  --regrade openai_gpt-6.1-sol --regrade-sets ref "${A[@]}"   # --dry: the plan and its price only
# measurements the app does not send: local:<id>@low (GPT-OSS's reasoning effort), local:<id>@out4096
```
