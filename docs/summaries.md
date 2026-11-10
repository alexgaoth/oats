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

## Round 2: a good summary with no key, at any length

Question (Alex, 2026-11-05): can a person with no cloud key get a good summary
on a normal Mac, at any length? Can the cloud do better than round 1?

### The bar, written before the runs (2026-11-05)

This section was committed before any round 2 model ran.

**Quality.** Round 1's bar stays: at most 1.2 invented facts in a summary, at
least 65% of the annotators' decisions, actions and problems covered, and every
summary complete. Claude Fable 5.1 decides; gpt-6.1-sol is the second judge.

**It must hold on all four.** Manual text and real recognition (`small.en`,
quiet room), for conversations under 1 hour and over 1 hour.

**Mac classes.** 16 GB and 32 GB or more. The memory rule stays: the peak is at
most half of the Mac's memory (8 GB and 16 GB). A Foundation Models route uses
the system's model and is judged on quality and time only.

**Time.** A 30-minute conversation in under 3 minutes on a base Mac. The base
Mac is an M4 with a 10-core GPU and 16 GB. No such Mac is here, so the time is
an estimate from this Mac's own run, split into reading and writing, with the
ratios of llama.cpp's Apple Silicon table (discussion #4167, Q4_0, 7B):

| Mac | reads, tokens/s | writes, tokens/s | reading time | writing time |
| --- | --- | --- | --- | --- |
| M5 Pro, 16-core GPU (this Mac) | 1,340 | 67.6 | × 1 | × 1 |
| M4, 10-core GPU (the bar) | 221 | 24.1 | × 6.1 | × 2.8 |
| M1, 8-core GPU (the slowest, shown beside it) | 118 | 14.2 | × 11.4 | × 4.8 |

**The split.** Nothing is tuned on the test meetings.

- **Test: round 1's sets.** eval24 (manual text), far8 (real recognition), and
  8 long conversations from the same series, each scored against all the
  annotators' items of its parts: ES2004a+b+c+d (132 min), IS1009a+b+c+d (109),
  TS3003a+b (61), TS3003a+b+c (99), TS3003a+b+c+d (142), TS3005a+b+c+d (144),
  IS1004a+b+c+d (119), ES2007a+b+c+d (109).
- **Dev: series that eval24 does not touch.** 16 meetings: ES2002b, ES2005c,
  ES2008c, ES2010c, ES2013a, ES2016d, IB4005, IB4011, IS1000d, IS1003b, IS1006a,
  IS1008c, TS3004c, TS3006a, TS3009d, TS3012b. 4 long conversations:
  ES2008a+b+c+d (133), IS1000a+b+c+d (141), TS3009a+b (66), TS3012a+b+c (95).
  Prompts, windows and settings are chosen here, with gpt-6.1-sol as the only
  judge, so the test meetings stay unseen and Claude Fable 5.1 is spent once.
- **Each frozen configuration runs once on the test sets**, beside the shipped
  path and two anchors (Claude Opus 5.5, gpt-6.1-sol), graded by both judges in
  one batch per judge.

### The answer (round 2)

Every number below is from the test sets, written once with frozen settings,
unless it says dev. "Covered / invented" means the share of the annotators'
decisions, actions and problems a summary states, and the invented facts in a
summary. The first pair is Claude Fable 5.1, the second gpt-6.1-sol.

- **No local route clears the bar.** The best is the request as shipped on Gemma 4
  E4B, on 16 GB: 53 / 1.0, 58 / 1.0 on manual text (12 points short of coverage, inside
  the limit on invented facts) and 45 / 1.8, 47 / 1.9 on `small.en` in a quiet room (20
  points short and 0.6 facts over). Qwen3.5 4B: 55 / 5.2 and 48 / 5.1. For 32 GB Macs the
  best seen is Gemma 4 12B, 72 / 2.3 on 8 dev meetings, not run on the test set. Time
  is not the problem: about 60 s for 30 minutes on the M4 estimate. Over an hour every
  local route still fails or misses by more.
- **Extract with quotes, then write: refuted.** The idea was that a quote check
  would remove invented facts mechanically. It does not. Models quote real words
  and then over-read them: "The team agreed..." on a suggestion. The check drops
  1 to 6% of items, and 78 of the 78 flagged claims in Claude Haiku's rendered
  items had a real quote. On Gemma 4 E4B (dev16, gpt-6.1-sol as judge) it lowers
  coverage from 61% to 42% and invented facts stay near 2, for 3 times the time.
- **A summary in parts solves length, not quality, on a local model.** Gemma 4
  E4B gets 54 / 3.4 in parts against 61 / 1.5 in one request on short meetings,
  and 42 / 6.8 on conversations over an hour. A cloud model gains a lot from
  parts on long text (gpt-6-luna 47 → 75), so the method works; the small model
  is the limit.
- **Apple Foundation Models work, and they are not good enough.** No refusal in
  about 90 requests, 8,192 tokens of context on macOS 27, and it runs here. In one
  request it fits only 6 of the 16 dev meetings (55 / 6.0). In parts it gets 22 / 3.8.
- **A verify pass does not lift the line between coverage and invented facts.** It
  removes about half of the invented facts and 17 to 28 points of coverage. Asking
  the model to revise its own draft changes nothing measurable.
- **Recognition is still the largest lever.** On steady sound, the same route gains
  8 to 21 points from turbo over `small.en`, and a further 13 to 20 from reading
  the whole recording with Parakeet (provisional, probably overstated) or 3 to 11
  with Apple. Most of the old "+28 to 35" was the model, not the re-read.
- **The prompt line "keep every decision, action and open problem"**, in place of
  "Bias toward brevity": no real change on short manual text, +6 to +10 points on
  conversations over an hour for both cloud models with no more invented facts, and
  0.6 to 1.4 more invented facts on real recognition. It does not help local models: Gemma 4 E4B stays at 53 and invents 0.2 to 0.4 more, Qwen3.5 4B gains 4 to 6 points and invents 1.1 more. Not adopted.
- **A real memory bug in the local path, new in this round:** see "The shipped
  path". Fixed in #175.

### Decisions for Alex (round 2)

1. **Keep the local defaults.** Gemma 4 E4B on 16 GB or more, Qwen3.5 4B under
   that. Nothing tested beats them on the bar. Gemma 4 12B covers more and invents
   more, at half the speed; it is the choice to measure next for 32 GB Macs.
2. **Say plainly what a local summary is.** Today's best on real recognition is 45% covered with 1.8 invented facts in a quiet room. Recommended: keep the
   record's wording honest for "On this Mac", and point long conversations at a key.
3. **Conversations over an hour on this Mac: your call.** They still fail. Dev
   results for Gemma 4 E4B, 4 conversations of 66 to 141 minutes: one request with a
   49,152-token context 37 / 1.5 at 6.6 GB; the app's request on parts of 35,000
   characters plus a merge 40 / 2.5. Both beat an error message and neither clears
   the bar. Not confirmed on the test set. Recommended: raise the context, because it
   is one constant and it invents the least, once a test run confirms it.
4. **A second pass after the conversation.** The in-room path keeps the WAV until the
   speaker pass ends, so a re-read needs no change to what the app keeps. Against
   turbo live on steady sound, Parakeet whole gains +13 to +20 points (provisional,
   probably overstated) and Apple whole +3 to +11 (interval across 0).
5. **The "Bias toward brevity" line: leave it for now.** See "Cloud". The gain is on
   manual text and long conversations; on real recognition it adds invented facts.
6. **gpt-6.1-sol stays OpenAI's default, Claude Opus 5.5 Anthropic's.** gpt-6.1-terra
   is cheaper and covers 3 to 5 points less. Claude Sonnet 5.5 with thinking on does
   not beat Opus 5.5: 86 / 1.0 against 87 / 0.5 with the same prompt.

### The shipped path, checked

No packaged app was launched. `scripts/local-summary-check.cjs` drives the app's own
main-process code (`LocalReasoningService`, `modelManagerBridge`, `llamaServer`) with
the app's llama-server (b9763), the registry's files, the prompt from the source, and
a stand-in for Electron. Both download URLs answer, at the size on disk.

| conversation | Gemma 4 E4B | Qwen3.5 4B |
| --- | --- | --- |
| IS1009c, 30 min | ok, 33.1 s with load, title 0.7 s, 5.9 GB | ok, 56.4 s with load, title 1.3 s, 4.4 GB |
| IB4010, 49 min | ok, 26.2 s, 6.4 GB | ok, 45.3 s, 5.5 GB |
| TS3003a+b, 61 min | ok, 25.4 s, 6.7 GB | ok, 46.1 s, 5.6 GB |
| TS3003a+b+c, 99 min | fails: "stopped at its output limit" | fails the same way |
| ES2004a+b+c+d, 132 min | refused: 30,076 tokens against 16,384 | refused: 29,259 tokens |

Timing is a loaded Mac (load above 60; Qwen3.5 4B ran outside the GPU lock, once, with
main's leave), so it is not valid for the bar. The results match round 1, with two
additions:

- **The memory bug.** llama-server keeps past prompts in memory, up to 8 GiB above
  the model (`--cache-ram`). Resident memory on Gemma 4 E4B rose about 130 MB a
  request, from 5.7 GB to 9.7 GB over 16 meetings and to 11.2 GB on long ones, and
  15.2 GB on Gemma 4 12B. With `LLAMA_ARG_CACHE_RAM=0` it stayed at 5.96 GB and read
  at the same speed. Fixed in #175. The peaks in the round 1 tables came from a few
  requests, so they are the right numbers once #175 is in.
- **At 99 minutes the failure is the wrong kind.** The prompt fits and the answer is
  cut, so the record says the generic failure and offers a retry that cannot work;
  only a refused request is "too long". Small, and not fixed.

### Models on this Mac

Test sets, the request as shipped. Covered / invented, first judge then second.

| route | manual, 24 meetings | `small.en` quiet, 8 | `small.en` steady, 8 | M4 estimate, 30 min |
| --- | --- | --- | --- | --- |
| Gemma 4 E4B, 16 GB or more | 53 [43, 62] / 1.0 [0.6, 1.5], 58 / 1.0 | 45 [35, 53] / 1.8 [0.9, 2.6], 47 / 1.9 | 24 / 4.3, 32 / 4.1 | 57 s |
| Gemma 4 E4B, the prompt line | 53 / 1.2, 53 / 1.4 | 45 / 2.1, 43 / 2.3 | not run | 60 s |
| Qwen3.5 4B, under 16 GB | 55 [43, 66] / 5.2 [4.2, 6.3], 57 / 6.7 | 48 [29, 68] / 5.1 [3.6, 6.3], 56 / 6.3 | not run | 82 s |
| Qwen3.5 4B, the prompt line | 61 / 6.3, 61 / 7.8 | not run | not run | 84 s |

The bar, per Mac class:

| | 16 GB: Gemma 4 E4B | 32 GB or more |
| --- | --- | --- |
| Manual, under 1 hour | 53 / 1.0: 12 points short | Gemma 4 12B 72 / 2.3 on dev8: 1.1 facts over, not on the test set |
| `small.en` quiet, under 1 hour | 45 / 1.8: 20 points short, 0.6 facts over | not run |
| Manual, over 1 hour | no summary today; dev: 37 / 1.5 with a larger context | not run |
| `small.en` quiet, over 1 hour | no summary today; not run with any fix | not run |
| 30 minutes on a base Mac, under 3 minutes | about 60 s, M1 about 105 s (loaded Mac) | Gemma 4 12B about 190 s on the M4 estimate |

Memory with #175: Gemma 4 E4B about 6.0 GB, Qwen3.5 4B 5.6 GB at most, Gemma 4 12B
not measured without the prompt cache (a 7.0 GB file, so it likely passes the 8 GB limit
of a 16 GB Mac). Nothing leaves the Mac on any local route. Licenses: Apache-2.0.

Dev screen on 8 meetings, the shipped request, gpt-6.1-sol as the only judge, covered
/ invented, loaded Mac.

| model | file | license | shipped request | with the prompt line | result |
| --- | --- | --- | --- | --- | --- |
| Gemma 4 E4B | 5.4 GB | Apache-2.0 | 63 / 1.5 | 56 / 2.6 | stays the default |
| Gemma 4 12B, Google's QAT Q4_0 | 7.0 GB | Apache-2.0 | 72 / 2.3 | 66 / 3.4 | more coverage, more invented, half the speed (418 and 21 tokens/s). Not run on the test set |
| Nemotron 3.5 Bolt E4B | 6.2 GB | OpenMDW-1.1 | 59 / 1.9 | 63 / 1.6 | same as Gemma 4 E4B, its base |
| Granite 4.2 8B | 5.3 GB | Apache-2.0 | 45 / 16.0 (7 of 8) | not run | ruled out |

Not measured: Gemma 4 E2B and Qwen3.8 9B Distill (fetched, then withdrawn from a full
GPU queue). LFM3 1.7B: the app's b9763 refuses its architecture; Homebrew's build 11960
loads it. Clef-Flash: its card says no free-form text. "Qwen3.5 14B" does not exist
from Qwen. Mistral Small 4 is 119B. The disk stopped larger models for 32 GB Macs
(Qwen3.8 27B, 19 GB; Mistral Small 3.2, 14.3 GB).

#### Foundation Models

`~/oats-asr-cache/fidelity-2/fm-bridge` (Swift CLI, README beside it). Available here;
context 8,192 tokens on macOS 27.0.1, 4,096 back-deployed on 26.0 to 26.3. No refusal in
about 90 requests of meeting text. One request fails above about 36 minutes
("Content contains 9611 tokens, which exceeds the maximum allowed context size of
8192"): 10 of 16 dev meetings. Quality, gpt-6.1-sol as judge: 55 / 6.0 on the 6
meetings that fit, 22 / 3.8 in parts on 13. It took 18 s a step at the median and up to
7 minutes for a meeting on the loaded Mac. Closed: it is far under the bar.

### Extract with quotes, parts, verify (dev16, gpt-6.1-sol as judge)

Covered / invented. gpt-6-luna and Claude Haiku 5.5 stood in while the GPU queue was
full, as a careful and an inventive model.

| variant | Gemma 4 E4B | gpt-6-luna | Claude Haiku 5.5 |
| --- | --- | --- | --- |
| The shipped request | 61 / 1.5 | 62 / 0.5 | 75 / 5.0 |
| With the prompt line | 55 / 2.1 | 72 / 0.8 | 81 / 6.1 |
| The prompt line, then revise your own draft | 57 / 1.9 | 71 / 0.6 | 81 / 5.8 |
| Items with quotes, then written | 42 / 1.9 | 76 / 1.3 | 78 / 4.9 |
| Items with quotes, rendered by code | 49 / 2.4 | 77 / 0.9 | 86 / 4.5 |
| Items with no quotes, rendered by code | | 83 / 2.0 | 86 / 4.4 |
| Prose notes per part, then a merge | 54 / 3.4 | 82 / 1.7 | 85 / 7.0 |
| The merge, then each bullet checked | | 54 to 72 / 0.5 to 0.9 | 66 / 3.9 |

- The quote check drops 1 to 6% of items. On gpt-6-luna quotes halve invented facts
  against items with none, for 6 points of coverage. On Claude Haiku they do nothing.
- A check of each bullet removes about half of the invented facts and 17 to 28 points
  of coverage, so it moves along the same line and does not lift it. Checking only decisions and
  actions, or moving unagreed decisions to the points, gives less of both.
- Writing "suggested" in place of "agreed" in items takes 0.3 invented facts off
  gpt-6-luna. Evidence first (quote before text) lowers coverage. Neither helps Gemma.
- Time, Gemma 4 E4B on the M4 estimate, per 30 minutes, loaded Mac: one request 82 s,
  notes in parts 153 s, items with quotes 227 s.

Settings on Gemma 4 E4B (dev8, shipped 63 / 1.5): temperature 0 58 / 1.3, 0.7 61 / 1.9,
repeat penalty 1.1 55 / 1.9, top-p 0.8 59 / 2.5, thinking on 60 / 1.0. All intervals
overlap. Nothing beats the app's request. Thinking is the one to look at again.

Long conversations, Gemma 4 E4B (dev, 4 conversations): notes in parts 42 / 7.0, the
app's request on parts with a model merge 40 / 2.5, with a code merge 53 / 4.8, one
request in a 49,152-token context 37 / 1.5 (resident 6.6 GB). gpt-6-luna in one request
47 / 1.4, in parts 75 / 2.5. These are dev numbers; the test run was withdrawn.

### Recognition: what each step buys

The 8 far-field meetings, `gpt-6.1-sol` and Claude Opus 5.5, with the prompt line
above. Covered / invented, first judge then second. Parakeet rows are provisional:
its card lists AMI in the training data, and on DiPCo, a room outside AMI, Parakeet
Ultra leads Apple by only +3.2 points [1.9, 4.4] and a turbo stand-in by +2.3
[1.3, 3.4] (track S). So these rows probably overstate its lead.

| what the summary read | content recall / WER | gpt-6.1-sol | Claude Opus 5.5 |
| --- | --- | --- | --- |
| Quiet room | | | |
| `small.en` live | 74.7 / 30.4 | 72 / 1.1, 72 / 1.4 | 84 / 1.8, 84 / 3.8 |
| turbo q5_0 live | | 72 / 0.6, 78 / 1.5 | 84 / 1.5, 83 / 3.0 |
| Apple speech live | | 69 / 0.5, 75 / 0.8 | 86 / 2.0, 85 / 3.5 |
| gpt-transcribe live | 81.3 / 23.4 | 77 / 0.1, 76 / 0.5 | 91 / 1.1, 89 / 2.8 |
| Parakeet Ultra live (provisional) | 83.0 / 20.4 | 69 / 0.5, 81 / 1.4 | 94 / 1.3, 87 / 1.8 |
| Apple, whole stream | 78.0 / 23.9 | 76 / 0.5, 80 / 0.9 | 93 / 1.1, 92 / 2.6 |
| Parakeet, second pass (provisional) | 84.8 / 19.0 | 79 / 0.1, 84 / 0.4 | 88 / 1.1, 88 / 2.3 |
| Parakeet, whole recording (provisional) | 85.7 / 17.9 | 72 / 0.4, 83 / 0.5 | 88 / 0.8, 84 / 2.0 |
| Steady sound | | | |
| `small.en` live | 40.1 / 58.5 | 33 / 2.4, 45 / 3.0 | 43 / 3.9, 47 / 4.1 |
| turbo q5_0 live | 47.2 / 52.9 | 48 / 2.4, 53 / 3.0 | 64 / 4.8, 68 / 5.8 |
| Apple speech live | | 57 / 1.3, 67 / 1.8 | 62 / 4.4, 66 / 5.3 |
| gpt-transcribe live | 49.8 / 50.9 | 46 / 1.4, 59 / 1.9 | 56 / 3.3, 64 / 3.5 |
| Parakeet Ultra live (provisional) | 55.1 / 44.3 | 50 / 0.9, 56 / 1.8 | 59 / 3.1, 68 / 3.8 |
| Apple, whole stream | 48.6 / 48.1 | 58 / 1.0, 64 / 1.4 | 67 / 3.1, 71 / 4.3 |
| Parakeet, second pass (provisional) | 64.5 / 37.1 | 66 / 0.5, 67 / 1.1 | 82 / 2.1, 78 / 4.0 |
| Parakeet, whole recording (provisional) | 66.2 / 34.6 | 68 / 1.0, 73 / 1.6 | 84 / 2.9, 82 / 4.4 |

Paired deltas on steady sound, points of coverage, 8 meetings, 95% bootstrap
interval over meetings, first judge, then the second judge's mean:

| delta | gpt-6.1-sol | Claude Opus 5.5 | invented facts |
| --- | --- | --- | --- |
| turbo live − `small.en` live | +15 [2, 29], +8 | +20 [5, 37], +21 | 0 to +1.6 |
| Apple whole − Apple live | +1 [−11, 13], −3 | +5 [−3, 12], +5 | −0.3 to −1.3 |
| Parakeet whole − Parakeet live (provisional) | +18 [7, 33], +16 | +25 [9, 41], +14 | −0.3 to +0.6 |
| Apple whole − turbo live | +9 [−7, 28], +11 | +3 [−14, 22], +3 | −1.4 to −1.6 |
| Parakeet whole − turbo live (provisional) | +19 [5, 35], +20 | +20 [7, 33], +13 | −1.4 to −1.9 |
| Apple whole − gpt-transcribe live | +12 [−3, 26], +4 | +11 [2, 20], +8 | −0.5 to +0.8 |
| Parakeet whole − gpt-transcribe live (provisional) | +22 [8, 35], +14 | +28 [12, 45], +18 | −0.4 to +0.9 |

- Most of the gain over `small.en` live is the model, not the re-read: turbo or
  Apple live already gains 15 to 24 points on steady sound.
- The re-read pays for Parakeet on steady sound (provisional) and little for Apple.
- In the quiet room every second pass is within noise of its live model and of
  turbo live. It lowers invented facts a little on some routes.
The same on Gemma 4 E4B, the request as shipped, covered / invented, first judge then
second. Better words help this model much less, because it states so little to begin
with:

| what it read | quiet room | steady sound |
| --- | --- | --- |
| `small.en` live | 45 / 1.8, 47 / 1.9 | 24 / 4.3, 32 / 4.1 |
| gpt-transcribe live | 48 / 1.3, 49 / 1.9 | 23 / 3.9, 34 / 4.4 |
| Apple, whole stream | 47 / 1.5, 43 / 1.4 | 29 / 3.4, 33 / 4.0 |
| Parakeet, whole recording (provisional) | 47 / 0.6, 46 / 1.0 | 36 / 2.9, 35 / 2.6 |

Track S's newest live text, `parakeet-ultra-context`, hears 8 s before each segment
(content 85.1 and 62.9). A second pass over it adds only 0.6 and 3.3 points of content, so
"Parakeet whole − Parakeet live" above overstates the re-read. It arrived after testing
stopped and is not measured here, nor is `turbo-whole`.

- One frozen prompt for garbled lines was tried. On `small.en` it moves coverage by
  −4 to +9 points and adds 0.1 to 1.0 invented facts in the quiet room, and nothing
  measurable on steady sound. A prompt does not recover words that recognition lost.

### Cloud

`/v1/models` on 2026-11-05 has no new writing model since 2026-10-28, only image
models. gpt-6.1-terra (2026-10-13) had not been measured. All of this is the test set,
with Claude at the app's 16,000 output tokens.

| route | manual, 24 meetings | manual, 8 over an hour | `small.en` quiet, 8 | `small.en` steady, 8 |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5, shipped prompt | 83 / 0.4, 86 / 1.1 | 73 / 1.0, 73 / 2.4 | 83 / 1.1, 90 / 2.4 | 45 / 3.1, 54 / 3.8 |
| Claude Opus 5.5, the prompt line | 87 / 0.5, 85 / 1.4 | 82 / 1.0, 82 / 2.4 | 84 / 1.8, 84 / 3.8 | 43 / 3.9, 47 / 4.1 |
| Claude Opus 5.5, the line and a rule for garbled lines | | | 89 / 1.3, 86 / 2.0 | 45 / 4.4, 56 / 5.0 |
| gpt-6.1-sol, shipped prompt | 73 / 0.2, 77 / 0.3 | 59 / 0.9, 63 / 0.6 | 67 / 0.3, 73 / 0.3 | 38 / 1.4, 41 / 1.4 |
| gpt-6.1-sol, the prompt line | 77 / 0.0, 77 / 0.5 | 67 / 0.9, 69 / 0.9 | 72 / 1.1, 72 / 1.4 | 33 / 2.4, 45 / 3.0 |
| gpt-6.1-sol, the line and a rule for garbled lines | | | 76 / 0.6, 78 / 1.3 | 39 / 1.5, 42 / 2.1 |
| gpt-6.1-terra, the prompt line | 70 / 0.0, 72 / 0.5 | | | |
| Claude Sonnet 5.5, thinking on, the prompt line | 86 / 1.0, 83 / 2.6 | | | |

The prompt line against the shipped prompt, paired, first judge then second:

- Manual, short: Opus +4.1 [1.1, 7.9], −1.0 [−2.9, 0.7]; sol +4.6 [0.4, 9.9], −0.3
  [−3.2, 2.4]. Invented facts do not change. The judges disagree, so call it no change.
- Manual, over an hour: Opus +10.0 [4.4, 16.7], +9.1 [4.5, 14.0]; sol +7.8 [3.2, 13.2],
  +5.8 [1.8, 10.1]. Invented facts do not change. This one is real.
- `small.en`, quiet: coverage inside the noise, invented +0.6 [0.0, 1.3] and +1.4 [0.6,
  2.1] for Opus, +0.9 [0.3, 1.5] and +1.1 [0.1, 2.1] for sol. This is the cost, and the
  app reads recognition, not manual text.
- Local: Gemma 4 E4B manual 0.0 [−5.4, 5.1] points and +0.17 [−0.33, 0.63] facts, quiet +0.7
  [−8.4, 10.9] and +0.38 [−0.25, 1.13]. Qwen3.5 4B manual +6.2 [−2.1, 14.5] and +1.13
  [−0.04, 2.33]. First judge, intervals across 0: no gain on the default, and more
  invented facts on the small model, as feared. Steady sound was not run on local models.

Round 1's cloud numbers repeat: Opus 5.5 83 / 0.4 here against 85 / 0.75, gpt-6.1-sol 73
/ 0.2 against 73 / 0.67. So no prompt beat round 1 on real input.

### What round 2 did not do

- **No timing is valid for the bar.** The Mac stayed loaded (load 8 to 180), and the
  quiet run was withdrawn when testing stopped. Every time here is "loaded Mac", and the
  M4 and M1 estimates come from those runs. A quiet run can only lower them.
- Not run on the test set: Gemma 4 12B, anything over an hour on a local model, Foundation
  Models. Local long numbers are dev only.
- Only 2 long conversations have far-field audio, so "real recognition over an hour"
  rests on those 2, and on cloud routes only.
- 32 GB Macs: no model larger than Gemma 4 12B was fetched, because of the disk.
- The second-pass rows are 8 AMI meetings. Turbo whole read was not published.

### Spend and downloads (round 2)

$78.75 in API calls (`FM_LEDGER`, `ledger-round2.jsonl`). Downloads, all checked against
Hugging Face's sha256: Gemma 4 12B QAT Q4_0 (google, 6.98 GB), Nemotron 3.5 Bolt E4B
Q4_K_M (nvidia, 6.18 GB), Granite 4.2 8B Q4_K_M (ibm-granite, 5.35 GB), LFM3 1.7B Q4_K_M
(bartowski, 1.12 GB), Gemma 4 E2B Q4_K_M (bartowski, 3.46 GB), Qwen3.8 9B Distill Q4_K_M
(empero-ai, 5.78 GB). Six AMI Array1-01 meetings (about 450 MB) were fetched for dev
replays and not used: the replays were withdrawn.

### Reproduce (round 2)

```sh
export FM_LEDGER=~/.cache/oats/summaries/ledger-round2.jsonl FM_BUDGET_USD=80
A=(--ami ~/oats-asr-cache/AMI --out eval)
# the replays: a folder of one file a meeting is enough
R=~/oats-asr-cache/replays
ASR=(--asr quiet=$R/small.en__quiet-room --asr pws=$R/parakeet-ultra-whole__steady-sound)
# a prompt change, on named sets (eval24, dev16, dev8, devlong, testlong, far8, farlong)
node scripts/summary-eval.mjs generate --model openai:gpt-6.1-sol --sets ref --meetings eval24,testlong \
  --tag complete --prompt-edit prompt-edit.json "${A[@]}"
# a variant in parts (scripts/lib/summary-parts.mjs): JSON or @file
lockf -k ~/oats-asr-cache/gpu.lock node scripts/summary-eval.mjs generate --model local:gemma-4-e4b-it-q4_k_m \
  --gguf <file> --llama-server <app's binary> --sets ref --meetings dev16 --tag notes \
  --pipeline '{"mode":"notes"}' --step-cache eval/steps "${A[@]}"
# Foundation Models, through fm-bridge
lockf -k ~/oats-asr-cache/gpu.lock node scripts/summary-eval.mjs generate --model fm:system --sets ref --meetings dev16 "${A[@]}"
# settings: @t0.1 @tp0.9 @mp0.1 @tk20 @rp1.1 @ctx32768 @think @out4096
node scripts/summary-eval.mjs compare --judge anthropic:claude-fable-5-1 --keys a,b --baseline a --meetings eval24 "${A[@]}"
# the shipped path through the app's own main-process code
lockf -k ~/oats-asr-cache/gpu.lock node scripts/local-summary-check.cjs --ami ~/oats-asr-cache/AMI --models <dir> \
  --resources <dir with bin/> --model gemma-4-e4b-it-q4_k_m --meetings IS1009c,TS3003a+TS3003b
```

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
