"""mlx-audio's speech models as a `room-replay.js --engine`.

Reads one JSON line per segment on stdin, {"id":1,"wav":"/path.wav"}, with an
optional "context" (a string, for the models that take one), and answers one
line on stdout, {"id":1,"text":"..."} or {"id":1,"error":"..."}. It prints
{"ready":true} once the model is loaded.

    python -I scripts/engines/mlx_engine.py --model <dir> [--language en]
        [--gen-kwargs '{"beam_size":5}']
"""

import argparse
import inspect
import json
import os
import sys
import traceback


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--language", default="en")
    parser.add_argument("--gen-kwargs", type=json.loads, default={})
    args = parser.parse_args()

    # Libraries print to stdout; only this process's answers may go there.
    answers = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)

    def say(obj):
        answers.write(json.dumps(obj, ensure_ascii=False) + "\n")
        answers.flush()

    import mlx.core as mx
    from mlx_audio.stt.utils import load_model

    model = load_model(args.model)
    accepts = inspect.signature(model.generate).parameters
    open_kwargs = any(p.kind == p.VAR_KEYWORD for p in accepts.values())
    base = {}
    if "language" in accepts or open_kwargs:
        base["language"] = args.language
    base.update(args.gen_kwargs)
    say({"ready": True, "accepts": sorted(accepts)})

    stream = mx.new_stream(mx.default_device())
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        try:
            kwargs = dict(base)
            if request.get("context"):
                kwargs["context"] = request["context"]
            if "generation_stream" in accepts or open_kwargs:
                kwargs["generation_stream"] = stream
            kwargs = {k: v for k, v in kwargs.items() if k in accepts or open_kwargs}
            result = model.generate(request["wav"], **kwargs)
            text = getattr(result, "text", result)
            say({"id": request["id"], "text": str(text).strip()})
            mx.clear_cache()
        except Exception as error:  # one bad segment must not end the run
            traceback.print_exc()
            say({"id": request["id"], "error": repr(error)})


if __name__ == "__main__":
    main()
