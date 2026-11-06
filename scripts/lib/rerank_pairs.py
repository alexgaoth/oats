#!/usr/bin/env python3
"""Score pairs of texts with a small cross-encoder, for the link benchmark.

Run it with -I and a venv that holds onnxruntime, tokenizers and numpy:

    python -I scripts/lib/rerank_pairs.py --model rerank-ettin-17m --pairs p.json --out s.json

`p.json` is a JSON array of [text, text]. `s.json` is a JSON array of numbers:
the model's raw score for each pair. Weights live in
~/oats-asr-cache/models/embed/. ONNX on the CPU, as the app's worker runs a
model. Local only.
"""

import argparse
import json
import os
import time

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

EMBED = os.path.expanduser("~/oats-asr-cache/models/embed")
FILES = {
    "rerank-ms-marco-MiniLM-L6-v2": "model.onnx",
    "rerank-ms-marco-TinyBERT-L2-v2": "model.onnx",
    "rerank-ettin-17m": "model.onnx",
    "rerank-ettin-68m": "model_qint8_arm64.onnx",
    "rerank-jina-v1-tiny-en": "model_quantized.onnx",
    "rerank-stsb-distilroberta-base": "model_qint8_arm64.onnx",
}
MAX_TOKENS = 512


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, choices=sorted(FILES))
    parser.add_argument("--pairs", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--threads", type=int, default=5)
    parser.add_argument("--batch", type=int, default=16)
    args = parser.parse_args()
    folder = os.path.join(EMBED, args.model)
    tokenizer = Tokenizer.from_file(os.path.join(folder, "tokenizer.json"))
    tokenizer.no_padding()
    tokenizer.enable_truncation(max_length=MAX_TOKENS, strategy="longest_first")
    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        os.path.join(folder, FILES[args.model]), options, providers=["CPUExecutionProvider"]
    )
    inputs = {item.name for item in session.get_inputs()}
    pad = tokenizer.token_to_id("[PAD]")
    if pad is None:
        pad = tokenizer.token_to_id("<pad>")
    pad = 0 if pad is None else pad
    pairs = json.load(open(args.pairs, encoding="utf-8"))
    order = sorted(range(len(pairs)), key=lambda index: len(pairs[index][0]) + len(pairs[index][1]))
    scores = [0.0] * len(pairs)
    started = time.perf_counter()
    for at in range(0, len(order), args.batch):
        indexes = order[at : at + args.batch]
        encoded = tokenizer.encode_batch([tuple(pairs[index]) for index in indexes])
        longest = max(len(item.ids) for item in encoded)
        ids = np.full((len(encoded), longest), pad, dtype=np.int64)
        mask = np.zeros((len(encoded), longest), dtype=np.int64)
        types = np.zeros((len(encoded), longest), dtype=np.int64)
        for row, item in enumerate(encoded):
            ids[row, : len(item.ids)] = item.ids
            mask[row, : len(item.ids)] = 1
            types[row, : len(item.ids)] = item.type_ids
        feeds = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in inputs:
            feeds["token_type_ids"] = types
        out = session.run(None, feeds)[0]
        values = out.reshape(len(encoded), -1)[:, 0]
        if not np.isfinite(values).all():
            raise RuntimeError("the model returned NaN or infinity")
        for index, value in zip(indexes, values):
            scores[index] = float(value)
    json.dump(scores, open(args.out, "w"))
    elapsed = time.perf_counter() - started
    print(f"{args.model}: {len(pairs)} pairs, {elapsed / max(1, len(pairs)) * 1000:.1f} ms a pair")


if __name__ == "__main__":
    main()
