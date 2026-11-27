# Telling the people in a room apart (2026-11-25)

A two-person conversation in a room came out of beta.4 with nobody told apart.
On the cloud route the room has no speaker pass at all; on the on-device route
the pass after Stop (pyannote turns, TitaNet-small voices, `sherpa-onnx-diarize`
at threshold 0.85) had been measured only on nine synthetic LibriSpeech
conversations. This round measures it on real conversations recorded in rooms,
and replaces it.

## The bottom line

**The pass today finds dozens of voices in two people.** On twenty two-person
conversations it found 16 to 58 voices; after the reader's phantom rules
(`speakerTurns.mjs`) it showed the right number of people in 2 of 20, up to 14
people, and put 61% of the lines on the right person in the eight it was
compared on first, 73% in the twelve held out.

**One voice a line, grouped by spectral clustering, gets 92%.** Each line the
segmenter cuts (`speechSegmenter.mjs`) gets one embedding from 3D-Speaker's
ERes2Net (VoxCeleb, English, 26.5 MB), and the lines are grouped with the count
of people from the eigengap (`roomVoices.mjs`). On twelve two-person
conversations it was not tuned on: 92.0% of the lines on the right person (73.3%
today; +18.7 points, 95% interval +10.4 to +27.5, better in 11 of 12), the right
number of people in 11 of 12 (none today). With three or four people (eight
conversations): 77.2%, the right count in 4 (today: 50.4%, and 1, with 8 to 13
people shown). A talk by one person is left
unlabelled, as the reader's rule wants, in 3 of 4.

**The pass, more than the model, was the problem.** TitaNet-small, the model
the app ships, gets 91.4% on the same twelve with the new pass. ERes2Net is
chosen because its features are Kaldi filterbanks, which `kaldiFbank.mjs`
reproduces exactly; TitaNet's NeMo features would need a second front end.

**It costs little.** 30 to 50 ms a line on one core, which can run while the
conversation goes on; grouping a conversation 0.3 to 1.7 s after Stop.

**If the count were known** (a "How many people?" when the recording starts):
92.0% with two people, the count always right; 82.8% with three or four. A
design question, not built.

## The data

The Santa Barbara Corpus of Spoken American English (Du Bois et al., UC Santa
Barbara; CC BY-ND 3.0 US): conversations recorded where they happened, in
homes, kitchens and workplaces, on a portable recorder with a stereo
microphone, transcribed with each speaker's turns and times. The public WAV
files, mixed to mono at 16 kHz. Nothing was sent anywhere; no audio is in this
repository.

- **Two people** (exactly two, or two holding 99% of the speech): 20
  conversations, 7.9 hours. Tuned on 8 (SBC005, 007, 010, 024, 029, 041, 045,
  058); the 12 others held out (SBC006, 009, 016, 017, 022, 028, 034, 043, 044,
  046, 047, 060). Men and women, two women, two men; a few where one person
  holds 80 to 90% of the speech.
- **Three or four people:** SBC002, 003, 011, 015, 031, 036, 048, 050.
- **One person** (a talk): SBC020, 025, 030, 040.

**The score.** Lines are the app's own (the segmenter over the recording). A
line's person is whoever holds most of its time in the transcript; lines of
laughter or noise are not scored. A person is anyone with 5% of the speech or
more. Groups are matched to people one to one, the match that puts the most
lines right; a person split in two loses the second group's lines. The reader's
own rules decide what is shown (`assignSpeakers`, with its phantom and
one-voice rules), so "shown" is the number of people a reader would see.
`scripts/room-speakers-eval.mjs` runs it.

## Voice models, on the transcript's own turns

Before any pass: each clean turn of the eight tune conversations (one person,
1.5 s or more, under 20% overlap), embedded by sherpa-onnx, and how far apart
the two people are. EER: same person or not, over all pairs of turns. Two
groups: average-linkage clustering into two, the share of speech right.

| model (sherpa-onnx release) | size | EER | two groups |
| --- | --- | --- | --- |
| 3D-Speaker ERes2Net, VoxCeleb | 26.5 MB | 12.8% | 91.7% |
| 3D-Speaker CAM++, VoxCeleb (the call path's) | 29.6 MB | 13.6% | 80.3% |
| NeMo TitaNet-large | 101 MB | 14.8% | 70.6% |
| NeMo TitaNet-small (in-room today) | 40 MB | 16.2% | 68.4% |
| WeSpeaker ResNet34-LM | 26.5 MB | 33.8% | 67.1% |
| WeSpeaker CAM++-LM | 29.3 MB | 36.2% | 68.2% |
| WeSpeaker ResNet293-LM | 114 MB | 33.1% | 66.6% |

The WeSpeaker numbers are suspect (an EER near 35% on voices this distinct);
their sherpa-onnx front end was not checked, and they were dropped.

Given whole turns, even TitaNet-small parts the two people of SBC005 at 99%:
the voices are there to tell apart.

## Passes, on the eight tune conversations (two people)

| pass | right count | right | wrong | no label |
| --- | --- | --- | --- | --- |
| today: pyannote turns, TitaNet-small, threshold 0.85 | 2/8 | 61.4% | 24.6% | 14.1% |
| today's, told there are two people | — | the clustering put 94% of SBC005 in one group: shown as one voice | | |
| lines, ERes2Net, average linkage cut at 0.4 to 0.7 | 2 to 5/8 | 73.0 to 80.6% | | |
| lines, ERes2Net, spectral, count from the eigengap | 5/8 | 89.8% | 10.1% | 0.1% |
| lines, ERes2Net, two people given | 8/8 | 88.3% | 11.7% | 0 |
| lines, CAM++, spectral | 4/8 | 89.3% | 10.7% | 0 |
| lines, TitaNet-large, spectral | 5/8 | 87.4% | 12.6% | 0 |
| lines, TitaNet-small, spectral | 4/8 | 84.9% | 15.1% | 0 |

The eigengap of one group is the largest for most conversations, people or
not: allowed to choose one, spectral clustering chose it for half of the
groups of three and four. So the pass looks for two people or more, and a
group with under 5% of the speech joins the nearest one (which leaves a talk
by one person as one voice), and two groups whose centres are 0.8 alike or more
are one voice (two people's were at most 0.72).

## Held out: twelve two-person conversations

| pass | right count | right | wrong |
| --- | --- | --- | --- |
| today's (3 to 9 people shown; 6.3% of lines with no label) | 0/12 | 73.3% | 20.4% |
| lines, ERes2Net, spectral (the app's, from `roomVoices.mjs`) | 11/12 | 92.0% | 8.0% |
| lines, ERes2Net, two people given | 12/12 | 92.0% | 8.0% |
| lines, CAM++, spectral | 9/12 | 90.0% | 10.0% |
| lines, TitaNet-small, spectral | 11/12 | 91.4% | 8.6% |

Against today's pass, conversation by conversation: +18.7 points of lines on
the right person (paired bootstrap, 95% interval +10.4 to +27.5), better in 11
of 12 and the same in one (SBC060, 95.1%).

The hardest: SBC034 (73.9%, a third person shown) and SBC006 (82.0%), where
one person holds 75% and 88% of the speech.

## Three or four people, and one

| pass | right count | right |
| --- | --- | --- |
| today's, three or four people (8 to 13 people shown) | 1/8 | 50.4% |
| lines, ERes2Net, spectral, three or four people | 4/8 | 77.2% |
| lines, ERes2Net, the count given | 8/8 | 82.8% |
| lines, ERes2Net, spectral, one person | 3/4 unlabelled | — |

SBC050 is the miss: four people shown as two, 34.6%.

## The features

A 3D-Speaker model reads 80 Kaldi log mel energies a 10 ms frame, the mean of
each band over its input taken out. sherpa-onnx computes them with
kaldi-native-fbank, 7,600 Hz at the top (Nyquist minus 400) and frames centred
on their step (`snip_edges` false). Against sherpa-onnx's own embedding on three
lines of SBC005, the same features with the top at 8 kHz gave 0.84 to 0.93
cosine, and flush frames 0.97 to 0.99; with every option the same, 1.00000.
`kaldiFbank.mjs` matches kaldi-native-fbank to 2e-4 on a synthetic signal, and
its embeddings match sherpa-onnx's at 1.00000 on 25 lines of SBC005.

The ONNX worker's own filterbank (`onnxWorker.js`, for the call path's CAM++
and the voice profiles built on it) is not these features: a Hamming window, no
pre-emphasis, no mean removed, and other mel triangles. That path is not
changed here.

## In the app

In a room on the on-device route (`ipcHandlers.js`, `startInRoomSegmenting`):

- **While the conversation goes on**, each segment the segmenter closes is
  given its voice in the ONNX worker (`roomVoiceTracker.mjs` →
  `roomVoiceEmbeddings.js` → `onnxWorker.js`): 39 ms a line, measured through
  the app's own worker under Electron on SBC005.
- **At Stop** the worker groups the lines (0.3 s for SBC005's 303) and the
  turns go to the reader as before (`conversation-speakers`,
  `assignSpeakers`). Through the worker, SBC005 scores as in the eval: 95.2%,
  two people.
- **No audio of the room is written.** Today's pass needed the whole
  conversation as a WAV in the temporary folder (115 MB an hour) and read it
  again after Stop: 66 to 119 s on two threads for 16 to 30 minutes of
  conversation. The voices are about 200 numbers a line, in memory, dropped
  when the pass ends.
- **The bundle** carries ERes2Net (26.5 MB) instead of TitaNet-small (40 MB).
  pyannote stays, for the call and upload paths.

On the cloud route (`roomCloudVoices.mjs`) the microphone still goes to the
realtime session, and the same audio is also cut into lines on the Mac, each
given its voice as above. The recording keeps its own clock, and each turn the
cloud transcribes is placed on it by its offsets in the session
(`audio_start_ms`, `audio_end_ms`; `openaiRealtimeStreaming.js`), counted back
from the newest audio sent. At Stop the lines are grouped and the reader gives
each turn the person whose lines it overlaps most. Checked on a real
`gpt-transcribe` session, with two men from LibriSpeech test-clean taking 16
turns over 2.7 minutes: all 17 turns placed, their starts on the true turns'
to 0.00 s and their ends to 0.25 s at the median, two people found, and 17 of
17 turns on the right person. Deepgram and AssemblyAI turns carry no offsets
yet and get no speakers.

## Reproduce

```bash
node scripts/room-speakers-eval.mjs --corpus ~/oats-asr-cache/sbcsae \
  --model ~/oats-plans/models-test/speaker/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx \
  --ids SBC006,SBC009,SBC016,SBC017,SBC022,SBC028,SBC034,SBC043,SBC044,SBC046,SBC047,SBC060
```

The corpus directory holds `wav16/<id>.wav` and `trn/<id>.trn`. The model is in
sherpa-onnx's `speaker-recongition-models` release.
