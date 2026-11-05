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
- **Test:** the top 3 models, and any tuned setting that survives, run on the
  16 Array1-01 meetings that no speech run has seen: the rest of the 24 meetings
  the other evals use (eval24: IS1009c-d, TS3003c-d, ES2003b, ES2007a, ES2009c,
  ES2012a, ES2014c, IB4010, IS1002b, IS1004d, IS1007c, TS3005a, TS3007c,
  TS3010a). Nothing is tuned on these. The decision reads the intervals from
  these meetings.

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
| Qwen3-ASR-1.7B | MLX, transformers | 4.7 GB bf16; 2.5 GB 8-bit; 1.6 GB 4-bit | Apache-2.0 | 13.41 | 8.31 | screened |
| Qwen3-ASR-0.6B | MLX, transformers | 1.6 GB bf16; 1.0 GB 8-bit; 0.7 GB 4-bit | Apache-2.0 | 16.97 | 9.33 | screened |
| tiro-qwen3-asr-1.7b-v2 (far-field fine-tune) | transformers | 4.1 GB bf16 | Apache-2.0 | 12.01 (rank 1) | | to screen |
| Mega-ASR (Qwen3 adapter) | MLX | 2.5 GB 8-bit | Apache-2.0 | 13.38 | | to screen |
| Granite Speech 5.0 2B | MLX, transformers | 5.0 GB | Apache-2.0 | 14.80 | 6.96 | screened |
| Granite Speech 5.0 470M TurboCTC | MLX, transformers | 0.95 GB | Apache-2.0 (the `-nc` twin is CC-BY-NC-SA: not usable) | 15.75 | 7.71 | screened |
| Cohere Transcribe 03-2026 | Core ML (FluidAudio), MLX | 4.1 GB; gated on Hugging Face | Apache-2.0 | 15.03 | 7.02 | gated: needs an account, so only a third-party copy |
| NVIDIA Nemotron 3.5 Transcribe (30B + 4B) | mlx-audio with NVIDIA's own NVFP4; NeMo-Speech.cpp GGUF | 21.6 GB NVFP4; 67.5 GB bf16 | OpenMDW-1.1 | 18.23 | 7.78 | runs in principle: over the size bar 14 times |
| whisper.cpp large-v3 q5_0 | the app's whisper-server | 1.08 GB | MIT | 18.02 (v3, full) | 13.63 | screened |
| distil-large-v3.5 | the app's whisper-server | 1.52 GB | MIT | none | 12.09 | screened |
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
