"""A neural VAD as the room's segmenter: cuts a 16 kHz stream into segments, for
`room-replay.js --segments-from`.

    python -I scripts/engines/vad_segments.py --stream-dir <dir> --out <dir>
        [--model silero_vad.onnx] [--threshold 0.5] [--silence-ms 300]
        [--pad-ms 100] [--max-s 20]

The stream files are `room-replay.js --dump-stream`'s. Silero's ONNX model reads
512 samples at a time with 64 samples of context and keeps a state. A segment
opens at `threshold`, closes after `--silence-ms` under `threshold - 0.15`, and
is split at its quietest stretch past `--max-s`, as the app's segmenter caps a
segment at 20 s. Times are on the recording's true clock: main's stream runs
0.06% slow (`capture` in room-replay.js).
"""

import argparse
import json
import os
import wave

import numpy as np


def true_seconds(sample):
    per_chunk = 533
    chunk = sample // per_chunk
    return (chunk * 800 + (sample - chunk * per_chunk) * 1.5) / 24000


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
    return np.array(out)


def regions(probs, threshold, silence_frames, min_frames, pad, max_frames):
    low = threshold - 0.15
    out = []
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
            end = i - quiet + 1
            if end - start >= min_frames:
                out.append((start, end))
            start = None
    if start is not None:
        out.append((start, len(probs)))
    split = []
    for a, b in out:
        while b - a > max_frames:
            window = probs[a + max_frames // 2 : a + max_frames]
            cut = a + max_frames // 2 + int(np.argmin(window))
            split.append((a, cut))
            a = cut
        split.append((a, b))
    return [(max(0, a - pad), min(len(probs), b + pad)) for a, b in split]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stream-dir", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--silence-ms", type=float, default=300)
    parser.add_argument("--min-ms", type=float, default=250)
    parser.add_argument("--pad-ms", type=float, default=100)
    parser.add_argument("--max-s", type=float, default=20)
    args = parser.parse_args()

    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    session = ort.InferenceSession(args.model, options, providers=["CPUExecutionProvider"])
    os.makedirs(args.out, exist_ok=True)
    frame_ms = 512 / 16
    for name in sorted(os.listdir(args.stream_dir)):
        if not name.endswith(".wav"):
            continue
        with wave.open(os.path.join(args.stream_dir, name), "rb") as wav:
            pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
        probs = probabilities(session, pcm.astype(np.float32) / 32768)
        found = regions(
            probs,
            args.threshold,
            round(args.silence_ms / frame_ms),
            round(args.min_ms / frame_ms),
            round(args.pad_ms / frame_ms),
            round(args.max_s * 1000 / frame_ms),
        )
        segments = [
            {"start": true_seconds(a * 512), "end": true_seconds(b * 512)} for a, b in found
        ]
        meeting = name[: -len(".wav")]
        with open(os.path.join(args.out, f"{meeting}.json"), "w") as out:
            json.dump({"meeting": meeting, "segments": segments}, out)
        print(meeting, len(segments), flush=True)


if __name__ == "__main__":
    main()
