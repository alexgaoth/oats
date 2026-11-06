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
- **Test:** the top 3 models, and any tuned setting that survives, run on
  meetings that no speech run has seen. **These are AMI's official test split
  only: IS1009c-d, TS3003c-d and EN2002a-d.** Nothing is tuned on them. The
  decision reads the intervals from them, pooled with the 8 screen meetings,
  which are the rest of the same split. EN2002 is the split's natural meetings,
  not the design scenario.
- **Train-split meetings are reported apart.** The cards of Granite Speech 5.0
  (150 hours of "AMI English" in training, `edinburghcstr/ami`) and Parakeet v3
  ("AMI" in NeMo ASR Set 3.0) say they trained on AMI. The official test split
  should be out of that training, but its rooms, its microphones and the design
  scenario's words are not. The 12 tuning meetings of eval24 are in AMI's train
  split, so a model trained on AMI may have heard exactly those recordings. They
  are replayed for the other tracks, and their numbers never go into a decision.
  (Written after the first screen showed Granite far ahead, and before any test
  meeting was scored.)
- **A room AMI never recorded:** DiPCo, the Dinner Party Corpus
  (CDLA-Permissive-1.0, 10 sessions, about 5 hours): four people at a table at
  home, one far-field array channel, local models only. Neither card lists it.
  A model that wins on AMI and not here has learned AMI.

## The candidates, from primary sources (2026-11-05)

Sizes and licenses are from the Hugging Face API (`/api/models/<repo>`) and the
model cards. The far-field column is the [FFASR
leaderboard](https://huggingface.co/spaces/treble-technologies/ffasr) (average
WER over clean, noisy and reverberant rooms, read from the Space's own API that
day). The AMI column is the [Open ASR
Leaderboard](https://huggingface.co/spaces/hf-audio/open_asr_leaderboard)'s
AMI-Cleaned, which is close-talk headset audio, not a far microphone.

| candidate | runtime on a Mac | download | license | FFASR avg WER | AMI-Cleaned WER | status here |
| --- | --- | --- | --- | --- | --- | --- |
| Apple SpeechTranscriber | `Speech` framework, macOS 26+, in the OS | 367 MB OS asset, shared, not ours | Apple SDK | none | none | screened |
| Apple DictationTranscriber | the same | the same family of OS assets | Apple SDK | none | none | screened |
| Parakeet TDT 0.6B v3 | sherpa-onnx int8 on CPU (the app's path), MLX, Core ML | 680 MB int8; 470 MB Core ML; 2.5 GB bf16 | CC-BY-4.0 | 19.04 | 9.42 | screened |
| Parakeet TDT 0.6B v2 | MLX, Core ML | 2.5 GB bf16; about 480 MB Core ML | CC-BY-4.0 | 17.66 | 9.09 | screened |
| Parakeet Ultra (moondream) | Core ML (FluidAudio); Photon | 1.26 GB; about 650 MB int8 Core ML | CC-BY-4.0 | none | none | screened |
| Parakeet Redux (moondream) | MLX, Core ML | 178 MB | CC-BY-4.0 | none | none | screened |
| Phonon-2, Bark 3.0 | Core ML (FluidAudio) | about 320 to 410 MB | CC-BY-4.0 | none | 9.32 (Phonon-2) | screened; the publishers' own `.bps` and `.fsq` files are not a safe format, so only Core ML |
| Qwen3-ASR-1.7B | MLX, transformers | 4.7 GB bf16; 2.5 GB 8-bit; 1.6 GB 4-bit | Apache-2.0 | 13.41 | 8.31 | screened, steady sound only |
| Qwen3-ASR-0.6B | MLX, transformers | 1.6 GB bf16; 1.0 GB 8-bit; 0.7 GB 4-bit | Apache-2.0 | 16.97 | 9.33 | withdrawn when the GPU queue ran long |
| tiro-qwen3-asr-1.7b-v2 (far-field fine-tune) | transformers | 4.1 GB bf16 | Apache-2.0 | 12.01 (rank 1) | | withdrawn: the base model did not earn it |
| Mega-ASR (Qwen3 adapter) | MLX | 2.5 GB 8-bit | Apache-2.0 | 13.38 | | withdrawn: the base model did not earn it |
| Granite Speech 5.0 2B | MLX, transformers | 5.0 GB | Apache-2.0 | 14.80 | 6.96 | withdrawn: over the size bar, and the GPU queue ran long |
| Granite Speech 5.0 470M TurboCTC | MLX, transformers | 0.95 GB | Apache-2.0 (the `-nc` twin is CC-BY-NC-SA: not usable) | 15.75 | 7.71 | screened |
| Cohere Transcribe 03-2026 | Core ML (FluidAudio), MLX | 4.1 GB; gated on Hugging Face | Apache-2.0 | 15.03 | 7.02 | gated: needs an account, so only a third-party copy |
| NVIDIA Nemotron 3.5 Transcribe (30B + 4B) | mlx-audio with NVIDIA's own NVFP4; NeMo-Speech.cpp GGUF | 21.6 GB NVFP4; 67.5 GB bf16 | OpenMDW-1.1 | 18.23 | 7.78 | runs in principle: over the size bar 14 times |
| whisper.cpp large-v3 q5_0 | the app's whisper-server | 1.08 GB | MIT | 18.02 (v3, full) | 13.63 | screened, steady sound only |
| distil-large-v3.5 | the app's whisper-server | 1.52 GB | MIT | none | 12.09 | withdrawn when the GPU queue ran long |
| WhisperKit large-v3-turbo 632 MB | Core ML on the Neural Engine | 646 MB | MIT | none | 13.88 (turbo) | screened |
| Moonshine streaming | transformers, ONNX | 1.1 GB (medium) | MIT | 50.25 (small) | | not screened: 37 points behind on far speech |
| Voxtral Mini 3B | MLX | 9.4 GB | Apache-2.0 | 21.58 | 13.57 | not screened: over the size bar, behind on far speech |
| Falcon ASR (TII, Oct 2026) | none | no weights published | no license stated | none | none | cannot be run: only a hosted demo. Arabic first. |
| TheWhisper large-v3-turbo (TheStage) | closed SDK, encrypted `.enc` files | 76 GB repo | CC-BY-4.0 on the card | 14.54 | 7.32 | not testable under the download rules |
| TEN VAD | native library | | Apache-2.0 with a no-compete condition | | | license blocks it for an MIT app |

`CohereLabs/cohere-transcribe-03-2026` is gated (`gated: auto`), and the brief
does not allow new accounts. `mlx-community/cohere-transcribe-03-2026-mlx-8bit`
is ungated, but the file is the same size as the original (4.1 GB).

**Apple's on-device speech, from the macOS 27 SDK's `Speech.swiftinterface`.**
`SpeechAnalyzer`, `SpeechTranscriber`, `DictationTranscriber` and `AssetInventory`
are `@available(anyAppleOS 26, *)`. `SpeechTranscriber.isAvailable` says whether
this Mac can run it. Options: presets `transcription`, `progressiveTranscription`
and their time-indexed forms, `ResultAttributeOption.audioTimeRange` and
`.transcriptionConfidence` (so word times and confidence exist), and
`AnalysisContext.contextualStrings` for hints. Its text has capitals and
punctuation. The model is not bundled by the app: `AssetInventory` fetches it
once from Apple through the OS (`assetInstallationRequest`, 367 MB here, in
`/System/Library/AssetsV2/com_apple_MobileAsset_UAF_Speech_AutomaticSpeechRecognition`,
with its own VAD). The app's minimum macOS is 11 (`scripts/build-macos-*.js`
target `arm64-apple-macosx11.0`), so a helper must be guarded and a Mac before
macOS 26 keeps Whisper.

**What the app's Parakeet path uses today.** `src/helpers/parakeetWsServer.js`
runs `sherpa-onnx-ws` on the CPU (`--num-threads` up to 4) with the int8 ONNX
files from the sherpa-onnx releases. `transcribeInRoomAudio` sends a segment to
it with no VAD and no partials. FluidAudio (Apache-2.0, v0.18.2) runs the same
weights as Core ML on the Neural Engine.

**FFASR's order is a useful prior.** Its far-field ranking puts the Qwen3 family
and Granite ahead of Parakeet and Whisper. It is synthetic rooms and short
utterances, so it does not replace the replay.

## The screen

Every sixth segment of the 8 meetings, the same segments for every model (602
with steady sound, 551 in the quiet room). Content recall, words recovered and
WER. No VAD on any engine here except the two whisper.cpp rows, which run the
app's own. Times are a loaded Mac (load average 60 to 170, other work on every
core): read them as an order, not as a measure.

| model | quiet: words, content, WER | steady: words, content, WER | content precision q / s | median ms a segment q / s, loaded Mac |
| --- | --- | --- | --- | --- |
| `small.en`, the app | 69.2, 73.0, 32.6 | 44.6, 39.9, 57.9 | 85.2 / 54.6 | 159 / 294 |
| Parakeet v3, int8 on sherpa-onnx, the app's Parakeet path | 73.4, 73.3, 28.6 | 44.5, 39.4, 57.1 | 85.7 / 65.8 | 702 / 829 (CPU) |
| WhisperKit turbo 632 MB, Neural Engine | 75.6, 79.8, 26.9 | 52.3, 48.7, 50.6 | 86.4 / 59.9 | 598 / 632 |
| Apple SpeechTranscriber | 75.8, 76.0, 26.1 | 51.1, 43.2, 51.4 | 82.5 / 57.8 | 105 / 124 |
| Parakeet v2, Core ML | 76.0, 78.1, 26.4 | 58.1, 54.8, 45.4 | 87.1 / 66.9 | 102 / 91 |
| Parakeet v3, Core ML | 77.9, 78.0, 24.6 | 59.2, 55.0, 44.0 | 87.9 / 69.4 | 214 / 283 |
| Parakeet Redux, Core ML | 75.5, 76.3, 26.4 | 52.9, 46.5, 49.7 | 84.2 / 56.2 | 268 / 235 |
| Phonon-2, Core ML | 75.9, 75.6, 27.5 | 55.5, 51.9, 47.8 | 84.7 / 61.3 | 124 / 102 |
| Bark 3.0, Core ML | 76.1, 76.2, 26.1 | 55.1, 50.8, 47.3 | 87.7 / 68.4 | 274 / 205 |
| **Parakeet Ultra, Core ML** | **81.1, 81.2, 21.5** | 60.9, 56.1, 42.2 | 86.3 / 65.6 | 91 / 98 |
| Granite TurboCTC, int8 ONNX on CPU | 76.4, 77.1, 25.7 | **62.8, 61.7, 40.2** | 88.4 / 70.5 | 604 / 525 (CPU) |
| Qwen3-ASR-1.7B, 8-bit MLX | not run | 60.4, 57.7, 42.1 | not run / 69.1 | not run / 281 (GPU) |
| `gpt-transcribe`, cloud | 76.8, 80.1, 24.6 | 52.8, 51.9, 48.6 | 90.9 / 69.9 | 650 / 581 |

Qwen3-ASR-1.7B wrote text for 26 of the segments with no speech (Ultra 3), at 2.3 GB
it is over the size bar, and it takes the GPU: stopped there. Other runs: Apple's
DictationTranscriber, all 8 meetings, content 58.2 and 22.0: out. `whisper.cpp` large-v3 q5_0, steady sound, 50.0. Granite's 8-bit MLX and
ONNX int8 read the same as its full weights (61.7 and 61.9 with steady sound).

**Three things this table says.** Models trained on noisy and far speech beat
Whisper by a wide margin with steady sound, at a tenth of its cost. The same
Parakeet v3 weights read 16 points better through FluidAudio's Core ML build
than through the app's sherpa-onnx int8 path with steady sound, and padding the
sherpa path with silence makes it worse (50.9 to 38.2 on two meetings), so the
app's Parakeet path is not a fair picture of Parakeet. And Ultra, moondream's
post-training of v3, is 3 points over v3 in the quiet room and 1 with steady
sound, for 150 MB more.

## The cloud, as the app really uses it

Round 1 gave OpenAI the room segmenter's segments. That is not the app's path. A
room with an OpenAI key (`getMeetingTranscriptionOptions`, `provider:
"openai-realtime"`) streams the whole microphone to a realtime session, and the
server's own VAD cuts the turns (`openaiRealtimeStreaming.js`, `server_vad`,
threshold 0.6, 600 ms of silence, 500 ms of prefix). `room-replay.js
--realtime-stream` now replays exactly that. Nothing raises a quiet segment on
this path, and nothing passes a language.

All numbers in this section are the 3 tune meetings, `gpt-transcribe` unless a
row says otherwise.

| content recall | quiet room | steady sound | quiet mic | speech inside a turn, quiet / steady |
| --- | --- | --- | --- | --- |
| segmenter's segments, one file each (round 1's test) | 72.1 | 44.0 | | 98% / 86% |
| server VAD 0.6: **the app today** | 70.9 | 46.1 | 61.3 | 89% / 77% |
| server VAD 0.3 | 70.9 | 49.4 | 68.1 | 91% / 80% |
| server VAD 0.2 | 70.5 | 49.3 | | |
| server VAD 0.1 | 60.4 | 50.9 | | |
| server VAD 0.3, 1,000 ms of silence | 66.8 | 46.0 | | |

On these 3 tune meetings 0.3 looked like a clear gain. **It did not hold.** On the
13 other meetings of AMI's test split, `gpt-transcribe`, 0.3 against 0.6, content
recall, interval over meetings:

| | 0.6: the app today | 0.3 | difference | speech inside a turn | segments with no speech that came back with text |
| --- | --- | --- | --- | --- | --- |
| quiet room | 76.7 | 76.5 | -0.2 (-1.2 to +0.5) | 98.3% to 98.8% | 10 to 10 |
| steady sound | 52.2 | 53.1 | +0.9 (+0.4 to +1.6) | 91.2% to 94.1% | 8 to 4 |
| quiet mic | 75.3 | 75.6 | +0.4 (-1.7 to +2.5) | 94.3% to 97.5% | 18 to 11 |

Under the bar in every room, so nothing changes here. The tune gain came from one
meeting. At 0.1 the quiet room breaks (turns run together, 10 points lost), and
a longer silence (1,000 ms) loses 4 points.

**Other OpenAI options, the same 3 meetings, against one file per segment:**

| | quiet room: content, difference | steady sound: content, difference | read |
| --- | --- | --- | --- |
| `languages: ["en"]` instead of `language` | 72.2, +0.1 | 44.1, +0.1 | no change |
| fixed `prompt` describing the room | 70.9, -1.2 (-1.5 to -0.7) | 44.3, +0.3 | no |
| running text as `prompt` (last 400 characters) | 72.0, -0.2 (-1.1 to +1.2) | 46.3, +2.2 (+1.4 to +2.8) | helps with steady sound; precision +5.2 |
| `keywords` (12 content words of the last 5 minutes) | 71.9, -0.3 | 44.4, +0.3 | no; precision -3.6 with steady sound |
| running text and keywords | 71.8, -0.4 | 45.7, +1.6 | worse than running text alone |
| realtime session, turn detection off | 72.3, +0.2 | 44.9, +0.9 (-0.3 to +2.4) | earlier turns are context by themselves |
| realtime, `noise_reduction: far_field` | 60.2, -11.9 | 16.5, -27.5 | never: it removes far voices |
| `gpt-live-transcribe` | 70.4, -1.8 | 38.8, -5.3 | no, and precision -6 and -16 |
| `gpt-live-transcribe`, `delay: xhigh` | 69.4, -2.7 | 39.1, -5.0 | no |
| `gpt-realtime-whisper` | 64.9, -7.2 | 33.1, -10.9 | no |

`gpt-transcribe` stays the cloud model. Its realtime session already gives each
turn the turns before it, so a prompt would add nothing on the app's path. The
question marks do not move with context (precision about 58, recall 32 to 34).

## A second pass at Finish

**The audio is there.** `startInRoomSegmenting` writes the whole conversation to
`os.tmpdir()/oats-conversation-<time>.wav` (16 kHz, 16-bit, 115 MB an hour) while
it records. `finishInRoomSegmenting` closes it at Stop, the speaker pass reads
it, and `runInRoomSpeakerPass` deletes it when it ends, "whatever happened"
(`ipcHandlers.js`). So a second pass costs no new storage. It must run before
that delete, and the promise holds as long as it does: nothing of the room
outlives the transcript. The file is the raw stream: `feedInRoomAudio` writes
`downsample24kTo16k` of the microphone, echo cancellation, noise suppression and
automatic gain are off at capture, and the raise and `afftdn` touch only the copy
of a segment sent to Whisper. `room-replay.js --dump-stream` writes the same
bytes, so these whole reads start from what the app would hold. On a cloud route
no WAV is written today: the microphone goes straight to the realtime session.

The title and the summary do not wait for the speaker pass, so a second pass
must either hold them or redo them.

**A whole read beats the live read on the same model.** Whole minus live, content
recall, 95% interval over meetings. The model reads the recording with its own
windows and context (Parakeet's 11 s windows with 2 s of context each side; Apple's
own segmentation), not the room segmenter's short segments.

| model | quiet room, 8 meetings | steady sound, 8 meetings | DiPCo U01, 10 sessions |
| --- | --- | --- | --- |
| Parakeet Ultra | 83.0 to 85.7, +2.7 (+2.0 to +3.5) | 55.1 to 66.2, +11.1 (+9.7 to +12.3) | 52.0 to 59.9, +7.9 (+7.1 to +8.6) |
| Parakeet Ultra, the 8 unseen meetings | 77.7 to 81.2, +3.5 (+2.6 to +4.3) | 49.5 to 60.8, +11.3 (+9.8 to +12.7) | |
| Apple SpeechTranscriber | 77.2 to 78.0, +0.8 (-0.1 to +2.0), holds 0 | 44.1 to 48.6, +4.5 (+3.2 to +5.6) | 48.8 to 51.2, +2.4 (+1.6 to +3.1) |

The same model, with the same weights, loses 11 points to a short segment with
steady sound. Parakeet is a long-context model, and the segmenter's segments
(2.8 s at the median) give it almost none. Cutting with Silero into pieces of up
to 28 s comes close: 64.5 with steady sound, 84.8 in the quiet room.

**Whether the summaries gain is track Y's test** (at least 5 points of coverage
with steady sound). The transcripts are in
`~/oats-asr-cache/replays/parakeet-ultra-whole__*` and `apple-whole__*`.

## Longer live segments: a lead

The same effect, live. The segmenter splits a turn at a 300 ms soft pause once it
is 2 s long (`splitAfterMs`). Parakeet Ultra on the 3 tune meetings:

| split a turn after | quiet room: content, purity, median final delay | steady sound: content, purity, median final delay |
| --- | --- | --- |
| 2 s, as it ships | 75.1, 85.2%, 2.3 s | 47.0, 87.1%, 1.6 s |
| 4 s | 76.4, 83.0%, 3.1 s | 50.1, 85.4%, 2.1 s |
| 8 s | 77.5, 81.1%, 4.6 s | 51.8, 83.7%, 2.6 s |
| never | 78.2, 77.7%, 6.6 s | 52.5, 82.2%, 3.1 s |

Each step trades purity (what the speaker pass can do) and the delay of a final
for words. This was not tested on other meetings: it is a design choice for
Alex, not a result.

## Enhancement: stopped

Every number is content recall on the 3 tune meetings, against the same engine
with no enhancement. An interval that holds 0 is marked as such.

| before the engine | Apple, quiet room | Apple, steady sound | Parakeet Ultra, steady sound |
| --- | --- | --- | --- |
| DeepFilterNet3, full attenuation | -8.4 (-10.8 to -3.0) | -6.6 (-7.1 to -6.1) | -10.9 (-14.7 to -6.7) |
| DeepFilterNet3, limited to 12 dB | -1.5 (-1.9 to -0.9) | +0.7 (-0.9 to +2.4), holds 0 | -1.2 (-3.2 to +0.4), holds 0 |
| WPE dereverberation, each segment | +0.4 (+0.2 to +0.6) | +0.7 (-0.7 to +2.1), holds 0 | not run |
| `afftdn` at the segment's floor + 1 dB | not run | not run | -0.4 (-1.1 to +0.5), holds 0 |

DeepFilterNet3 sounds cleaner and hears less. It removes the far voices'
consonants, and a recognizer trained on noisy speech does better with the noise
left in. WPE's gain is under the noise of a run. Stopped: nothing here earns a
step in the path, and `afftdn` stays where round 1 put it, for `base` and `small`
only. Code and weights of DeepFilterNet are MIT or Apache-2.0 (one license for
the repository), and its only runtime here was the publisher's own 0.5.6 binary.

## VAD and segmenting

**Silero v6 as the live segmenter loses speech.** Silero's ONNX model (MIT, from
`silero-vad` 6.2.3) cut the stream instead of the energy segmenter: open at the
threshold, close after 300 ms under it, 100 ms of padding, 20 s at most. Through
Apple's engine on the 3 tune meetings:

| | speech sent, quiet / steady | content, quiet / steady | segments with no speech |
| --- | --- | --- | --- |
| the app's energy segmenter | 98% / 86% | 68.2 / 38.2 | 102 / 60 |
| Silero v6, threshold 0.5 | 76% / 65% | 65.1 / 37.9 | 14 / 6 |
| Silero v6, threshold 0.35 | 78% / 68% | 65.5 / 39.2 | 20 / 9 |

It sends a quarter less speech and loses 3 points in the quiet room. It keeps out
far voices, which is what this app exists to hear. The energy segmenter stays.
TEN VAD was not run: its license adds a no-compete condition to Apache-2.0
("You may not Deploy the ten-vad in a way that competes with Agora's offerings"),
which an MIT app cannot pass on.

## How to run it

`room-replay.js` runs any recognizer through the app's segmenter and scoring:
`--engine` takes a process that answers on stdio (the line protocol is in the
script's header). `scripts/engines/` holds the ones used here. `room-compare.js`
gives the intervals, the invented phrases and the question marks.

```sh
A=(); for m in ES2004a ES2004b ES2004c ES2004d IS1009a IS1009b TS3003a TS3003b; do
  A+=(--audio ami/audio/$m.Array1-01.wav); done
ROOM=(--level 0.0225 --noise pink.wav --noise-level 0.012)   # steady sound

# Apple's on-device model: macOS 26+, nothing to download by hand
swiftc -parse-as-library -O -target arm64-apple-macos26.0 \
  scripts/engines/speech-analyzer.swift -o speech-analyzer
node scripts/room-replay.js "${A[@]}" --ami ami/annotations $ROOM \
  --engine '["./speech-analyzer"]' --engine-label apple --json apple.json

# any MLX model (mlx-audio from PyPI), a sample of every sixth segment
node scripts/room-replay.js "${A[@]}" --ami ami/annotations $ROOM --every 6 \
  --engine '["python","-I","scripts/engines/mlx_engine.py","--model","<dir>"]'

# the same run behind the app's VAD, without running the model again
node scripts/room-replay.js "${A[@]}" --ami ami/annotations $ROOM \
  --from-run apple.json --vad-gate small.en.json --json apple-gated.json

# the path a room takes with an OpenAI key
OPENAI_API_KEY=... node scripts/room-replay.js "${A[@]}" --ami ami/annotations $ROOM \
  --realtime-stream gpt-transcribe --pace 8

# a room outside AMI (DiPCo, local models only)
node scripts/room-replay.js --dipco DiPCo --dipco-array U01 --level 0.0225 \
  --engine '["./speech-analyzer"]' --json dipco.json

# two runs compared, a 95% interval over meetings
node scripts/room-compare.js --base a.json --run b.json --ami ami/annotations \
  --others c.json,d.json
```

FluidAudio (Parakeet on the Neural Engine) has no prebuilt CLI that speaks this
protocol. `scripts/engines/fluid-engine/engine.swift` does. On this Mac `swift
build` crashes (the Command Line Tools' `swift-package` has a missing symbol), so
`scripts/engines/fluid-engine/build.sh` builds it with `swiftc` from the v0.18.2
sources.
