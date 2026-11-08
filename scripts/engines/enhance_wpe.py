"""Single-channel dereverberation (WPE) as a `room-replay.js --enhance` process.

Reads {"id":1,"wav":in,"out":out} on stdin, writes the dereverberated 16 kHz
PCM to `out`, answers {"id":1}. Prints {"ready":true} first.

    python -I scripts/engines/enhance_wpe.py [--taps 10] [--delay 3] [--iterations 3]
"""

import argparse
import json
import os
import sys
import wave

import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--taps", type=int, default=10)
    parser.add_argument("--delay", type=int, default=3)
    parser.add_argument("--iterations", type=int, default=3)
    args = parser.parse_args()

    answers = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)

    from nara_wpe.utils import istft, stft
    from nara_wpe.wpe import wpe

    params = {"size": 512, "shift": 128}
    print(json.dumps({"ready": True}), file=answers, flush=True)
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        try:
            with wave.open(request["wav"], "rb") as wav:
                pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
            x = pcm.astype(np.float64) / 32768
            Y = stft(x[None, :], **params).transpose(2, 0, 1)  # F, D, T
            Z = wpe(
                Y, taps=args.taps, delay=args.delay, iterations=args.iterations,
                statistics_mode="full",
            ).transpose(1, 2, 0)
            z = istft(Z, size=params["size"], shift=params["shift"])[0][: len(x)]
            if len(z) < len(x):
                z = np.pad(z, (0, len(x) - len(z)))
            out = np.clip(z * 32768, -32768, 32767).astype(np.int16)
            with wave.open(request["out"], "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(out.tobytes())
            print(json.dumps({"id": request["id"]}), file=answers, flush=True)
        except Exception as error:
            print(json.dumps({"id": request["id"], "error": repr(error)}), file=answers, flush=True)


if __name__ == "__main__":
    main()
