"""sherpa-onnx's offline transducers as a `room-replay.js --engine`: the runtime
of the app's Parakeet path (helpers/parakeetWsServer.js), on the CPU.

    python -I scripts/engines/sherpa_engine.py --model <dir> [--threads 4]

The line protocol is in room-replay.js's header.
"""

import argparse
import json
import os
import sys
import wave

import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()

    answers = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)

    def say(obj):
        answers.write(json.dumps(obj, ensure_ascii=False) + "\n")
        answers.flush()

    import sherpa_onnx

    pick = lambda name: os.path.join(args.model, name)
    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=pick("encoder.int8.onnx"),
        decoder=pick("decoder.int8.onnx"),
        joiner=pick("joiner.int8.onnx"),
        tokens=pick("tokens.txt"),
        num_threads=args.threads,
        model_type="nemo_transducer",
        decoding_method="greedy_search",
    )
    say({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        try:
            with wave.open(request["wav"], "rb") as wav:
                rate = wav.getframerate()
                samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
            stream = recognizer.create_stream()
            stream.accept_waveform(rate, samples.astype(np.float32) / 32768.0)
            recognizer.decode_stream(stream)
            say({"id": request["id"], "text": stream.result.text.strip()})
        except Exception as error:
            say({"id": request["id"], "error": repr(error)})


if __name__ == "__main__":
    main()
