"""Silero VAD as an engine for `room-replay.js`: it says whether a segment holds
speech, and reads no words. It tests a gate for an engine that has no VAD of its
own, with no whisper-server beside it.

    node scripts/room-replay.js ... --engine-label silero-gate --engine \
      '["python","-I","scripts/engines/silero_gate.py","--model","silero_vad.onnx"]'

The answer is "speech" or nothing. Each frame of 512 samples gets a probability.
A region opens at `--threshold`, closes after `--silence-ms` under `threshold -
0.15`, and counts when it is at least `--min-speech-ms` long: the rule of
whisper.cpp's VAD, at the app's numbers (`src/constants/whisperVad.json`).
"""

import argparse
import json
import sys
import wave

import numpy as np
import onnxruntime as ort


def read_wav(path):
    with wave.open(path, "rb") as w:
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def probabilities(session, samples):
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    sr = np.array(16000, dtype=np.int64)
    out = []
    for at in range(0, len(samples) - 511, 512):
        chunk = samples[at : at + 512][None, :]
        x = np.concatenate([context, chunk], axis=1)
        p, state = session.run(None, {"input": x, "state": state, "sr": sr})
        context = x[:, -64:]
        out.append(float(p[0, 0] if p.ndim == 2 else p[0]))
    return out


def has_speech(probs, threshold, min_frames, silence_frames):
    low = threshold - 0.15
    start = None
    quiet = 0
    for i, p in enumerate(probs):
        if start is None:
            if p >= threshold:
                start = i
                quiet = 0
            continue
        quiet = quiet + 1 if p < low else 0
        if quiet >= silence_frames:
            if i - quiet + 1 - start >= min_frames:
                return True
            start = None
    return start is not None and len(probs) - start >= min_frames


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--min-speech-ms", type=float, default=250)
    parser.add_argument("--silence-ms", type=float, default=200)
    args = parser.parse_args()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    session = ort.InferenceSession(args.model, options, providers=["CPUExecutionProvider"])
    per_ms = 16000 / 512 / 1000
    min_frames = max(1, round(args.min_speech_ms * per_ms))
    silence_frames = max(1, round(args.silence_ms * per_ms))
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        request = json.loads(line)
        try:
            samples = read_wav(request["wav"])
            speech = has_speech(
                probabilities(session, samples), args.threshold, min_frames, silence_frames
            )
            print(json.dumps({"id": request["id"], "text": "speech" if speech else ""}), flush=True)
        except Exception as error:  # the replay counts a failed request
            print(json.dumps({"id": request["id"], "error": str(error)}), flush=True)


if __name__ == "__main__":
    main()
