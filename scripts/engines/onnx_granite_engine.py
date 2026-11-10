"""Granite Speech 5.0 TurboCTC on ONNX Runtime as a `room-replay.js --engine`.

An encoder-only model: log-mel features, one pass, greedy CTC. The model file is
exported from IBM's own weights with transformers and torch; the app already
ships ONNX Runtime (`onnxruntime-node`), so this is the path a CPU would take.

    python -I scripts/engines/onnx_granite_engine.py --model model.onnx \
        --tokenizer tokenizer.json [--threads 4]

The line protocol is in room-replay.js's header.
"""

import argparse
import json
import os
import sys
import wave

import numpy as np

RATE = 16000
N_FFT = 512
WIN = 400
HOP = 160
N_MELS = 80
FLOOR = 8.0


def mel_filters():
    """torchaudio's melscale_fbanks: htk scale, norm None."""
    n_freqs = N_FFT // 2 + 1
    freqs = np.linspace(0.0, RATE / 2, n_freqs)
    m_max = 2595.0 * np.log10(1.0 + (RATE / 2) / 700.0)
    points = 700.0 * (10.0 ** (np.linspace(0.0, m_max, N_MELS + 2) / 2595.0) - 1.0)
    points[0], points[-1] = 0.0, RATE / 2
    deltas = points[1:] - points[:-1]
    slopes = points[None, :] - freqs[:, None]
    down = (-1.0 * slopes[:, :-2]) / deltas[:-1]
    up = slopes[:, 2:] / deltas[1:]
    return np.maximum(0.0, np.minimum(down, up)).astype(np.float32)  # [freqs, mels]


FILTERS = mel_filters()


def hann():
    window = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(WIN) / WIN)
    left = (N_FFT - WIN) // 2
    return np.pad(window, (left, N_FFT - WIN - left)).astype(np.float32)


WINDOW = hann()


def features(audio):
    mel_frames = len(audio) // HOP
    frames = 2 * ((mel_frames + 1) // 2)
    needed = (frames - 1) * HOP + 1
    if len(audio) < needed:
        audio = np.pad(audio, (0, needed - len(audio)))
    padded = np.pad(audio, (N_FFT // 2, N_FFT // 2), mode="reflect")
    stacked = np.lib.stride_tricks.sliding_window_view(padded, N_FFT)[::HOP][:frames]
    power = np.abs(np.fft.rfft(stacked * WINDOW, n=N_FFT, axis=-1)) ** 2
    logmel = np.log10(np.maximum(power @ FILTERS, 1e-10))
    return np.maximum(logmel, logmel.max() - FLOOR) / 4.0 + 1.0


def frontend(audio):
    logmel = features(audio)
    padded = np.concatenate([logmel[:1], logmel, logmel[-1:]], axis=0)
    deltas = (padded[2:] - padded[:-2]) / 2.0
    both = np.concatenate([logmel, deltas], axis=-1)
    return both.reshape(-1, 2 * both.shape[-1]).astype(np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--tokenizer", required=True)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()

    answers = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)

    import onnxruntime as ort
    from tokenizers import Tokenizer

    tokenizer = Tokenizer.from_file(args.tokenizer)
    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    session = ort.InferenceSession(args.model, options, providers=["CPUExecutionProvider"])
    print(json.dumps({"ready": True}), file=answers, flush=True)
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        try:
            with wave.open(request["wav"], "rb") as w:
                pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
            audio = pcm.astype(np.float32) / 32768
            if len(audio) < 1120:
                audio = np.pad(audio, (0, 1120 - len(audio)))
            logits = session.run(None, {"input_features": frontend(audio)[None]})[0][0]
            ids = logits.argmax(-1)
            keep = np.concatenate([[True], ids[1:] != ids[:-1]]) & (ids != 0)
            text = tokenizer.decode([int(i) for i in ids[keep]], skip_special_tokens=True).strip()
            print(json.dumps({"id": request["id"], "text": text}), file=answers, flush=True)
        except Exception as error:
            print(json.dumps({"id": request["id"], "error": repr(error)}), file=answers, flush=True)


if __name__ == "__main__":
    main()
