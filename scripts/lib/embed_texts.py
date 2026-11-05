#!/usr/bin/env python3
"""Embed texts with a screened model, for the link benchmark (docs/link-eval.md).

Run it with -I and a venv that holds onnxruntime, tokenizers and numpy:

    python -I scripts/lib/embed_texts.py --config bge-small --texts t.json --store DIR
    python -I scripts/lib/embed_texts.py --config bge-small --smoke
    python -I scripts/lib/embed_texts.py --config bge-small --speed

Weights live in ~/oats-asr-cache/models/embed/ (its README.md has each file's
source). Vectors go to DIR/<config>/vectors.f32 (little-endian float32, unit
length) with DIR/<config>/keys.txt (SHA-1 of each text, one a line), appended
batch by batch, so a stopped run resumes. The benchmark reads them with
`scripts/lib/embed-store.mjs`.

ONNX models run on the CPU through onnxruntime, as the app's worker does.
GGUF models (nomic, Qwen) run on the CPU through llama-server (-ngl 0).
Local only: nothing here reads a key or sends a text anywhere.
"""

import argparse
import hashlib
import json
import os
import resource
import subprocess
import sys
import time
import urllib.request

import numpy as np

EMBED = os.path.expanduser("~/oats-asr-cache/models/embed")

# pool: "mean", "cls" or "sentence" (the graph's own sentence_embedding output).
# prefix: what the publisher asks a symmetric task to start with.
CONFIGS = {
    "minilm": dict(dir="all-MiniLM-L6-v2", file="model.onnx", pool="mean"),
    "minilm-256": dict(dir="all-MiniLM-L6-v2", file="model.onnx", pool="mean"),
    "bge-small": dict(dir="bge-small-en-v1.5", file="model.onnx", pool="cls"),
    "gemma2": dict(
        dir="embeddinggemma-2",
        file="model_q4.onnx",
        pool="sentence",
        prefix="task: sentence similarity | query: ",
    ),
    "gemma2-f16": dict(
        dir="embeddinggemma-2",
        file="model_q4f16.onnx",
        pool="sentence",
        prefix="task: sentence similarity | query: ",
    ),
    "gemma2-cluster": dict(
        dir="embeddinggemma-2",
        file="model_q4.onnx",
        pool="sentence",
        prefix="task: clustering | query: ",
    ),
    "gemma1": dict(
        dir="embeddinggemma-300m",
        file="model_q4f16.onnx",
        pool="sentence",
        prefix="task: sentence similarity | query: ",
    ),
    "arctic-m": dict(dir="snowflake-arctic-embed-m-v1.5", file="model_quantized.onnx", pool="sentence"),
    "granite-small": dict(
        dir="granite-embedding-small-english-r2", file="model_fp16.onnx", pool="sentence"
    ),
    "granite-97m": dict(
        dir="granite-embedding-97m-multilingual-r2", file="model_quint8_avx2.onnx", pool="cls"
    ),
    "mxbai": dict(dir="mxbai-embed-large-v1", file="model_quantized.onnx", pool="cls"),
    "nomic-v2": dict(
        gguf="nomic-embed-text-v2-moe/nomic-embed-text-v2-moe.Q4_K_M.gguf",
        pool="mean",
        prefix="search_document: ",
        context=2048,
    ),
    "qwen-0.6b": dict(
        gguf="qwen3-embedding-0.6b/Qwen3-Embedding-0.6B-Q8_0.gguf", pool="last", context=2048
    ),
}

MAX_TOKENS = 256  # As the app's worker reads a text.


def key_of(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


class OnnxModel:
    def __init__(self, config, threads):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        folder = os.path.join(EMBED, config["dir"])
        self.config = config
        self.tokenizer = Tokenizer.from_file(os.path.join(folder, "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=MAX_TOKENS)
        # A tokenizer.json can carry its own padding (MiniLM's is a fixed 128),
        # and pad tokens would then count as text. Padding is done below.
        self.tokenizer.no_padding()
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        # Waiting threads sleep: on a busy machine spinning burns the cores the
        # work needs. `--speed` keeps the default, as the app's worker runs.
        if not config.get("spin"):
            options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.session = ort.InferenceSession(
            os.path.join(folder, config["file"]), options, providers=["CPUExecutionProvider"]
        )
        self.inputs = {item.name: item for item in self.session.get_inputs()}
        self.outputs = [item.name for item in self.session.get_outputs()]
        pad = self.tokenizer.token_to_id("<pad>")
        if pad is None:
            pad = self.tokenizer.token_to_id("[PAD]")
        self.pad = pad if pad is not None else 0

    def embed(self, texts):
        prefix = self.config.get("prefix", "")
        encoded = self.tokenizer.encode_batch([prefix + text for text in texts])
        longest = max(len(item.ids) for item in encoded)
        ids = np.full((len(encoded), longest), self.pad, dtype=np.int64)
        mask = np.zeros((len(encoded), longest), dtype=np.int64)
        for row, item in enumerate(encoded):
            ids[row, : len(item.ids)] = item.ids
            mask[row, : len(item.ids)] = 1
        feeds = {"input_ids": ids, "attention_mask": mask}
        for name, item in self.inputs.items():
            if name in feeds:
                continue
            if name == "token_type_ids":
                feeds[name] = np.zeros_like(ids)
            elif name.endswith("_features"):
                # A multimodal graph's other inputs, empty for text.
                shape = [0 if not isinstance(size, int) else size for size in item.shape]
                feeds[name] = np.zeros(shape, dtype=np.float32)
            else:
                raise RuntimeError(f"unknown input {name}")
        pool = self.config["pool"]
        if pool == "sentence":
            out = self.session.run(["sentence_embedding"], feeds)[0]
        else:
            hidden = self.session.run([self.outputs[0]], feeds)[0]
            if pool == "cls":
                out = hidden[:, 0]
            else:
                weights = mask[:, :, None].astype(np.float32)
                out = (hidden * weights).sum(axis=1) / weights.sum(axis=1)
        return unit(out)


class GgufModel:
    """llama-server on the CPU: its pooling and tokenizer, as the publisher's card says."""

    def __init__(self, config, threads):
        self.config = config
        self.port = 18000 + (os.getpid() % 2000)
        binary = "/opt/homebrew/bin/llama-server"
        path = os.path.join(EMBED, config["gguf"])
        args = [
            binary, "--model", path, "--host", "127.0.0.1", "--port", str(self.port),
            "--embedding", "--pooling", config["pool"], "--n-gpu-layers", "0",
            "--threads", str(threads), "--threads-batch", str(threads),
            "--ctx-size", str(config.get("context", 2048)), "--parallel", "1",
            "--batch-size", str(config.get("context", 2048)),
            "--ubatch-size", str(config.get("context", 2048)),
        ]
        environment = {**os.environ, "LLAMA_ARG_OFFLINE": "1"}
        self.child = subprocess.Popen(
            args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=environment
        )
        deadline = time.time() + 120
        while time.time() < deadline:
            try:
                with self._open(f"http://127.0.0.1:{self.port}/health") as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(0.3)
        raise RuntimeError("llama-server did not start")

    def _open(self, request, timeout=120):
        # Past the machine's proxy: this is a server on this computer.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        return opener.open(request, timeout=timeout)

    def embed(self, texts):
        prefix = self.config.get("prefix", "")
        out = []
        for text in texts:
            body = json.dumps({"input": (prefix + text)[:6000]}).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{self.port}/v1/embeddings",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            with self._open(request) as response:
                out.append(json.load(response)["data"][0]["embedding"])
        return unit(np.array(out, dtype=np.float32))

    def close(self):
        self.child.terminate()


def unit(matrix):
    matrix = np.asarray(matrix, dtype=np.float32)
    norm = np.linalg.norm(matrix, axis=1, keepdims=True)
    if not np.isfinite(matrix).all():
        raise RuntimeError("the model returned NaN or infinity")
    return matrix / np.maximum(norm, 1e-12)


def load(name, threads):
    config = CONFIGS[name]
    return GgufModel(config, threads) if "gguf" in config else OnnxModel(config, threads)


def smoke(name, threads):
    """Paraphrases must score above unrelated texts, and no vector may be NaN."""
    model = load(name, threads)
    texts = [
        "The remote control needs bigger buttons and a simpler layout.",
        "We should make the buttons on the remote larger and easier to use.",
        "Who gets the corner office when the department moves to the new building?",
        "The film has a great soundtrack but it runs for three hours.",
        "yeah",
    ]
    vectors = model.embed(texts)
    similar = float(vectors[0] @ vectors[1])
    others = [float(vectors[0] @ vectors[index]) for index in (2, 3, 4)]
    print(f"{name}: dim {vectors.shape[1]}, paraphrase {similar:.3f}, others "
          + " ".join(f"{value:.3f}" for value in others))
    if isinstance(model, GgufModel):
        model.close()
    if similar <= max(others):
        sys.exit(f"{name}: failed the smoke test")


def speed(name, threads, texts_file):
    """One text at a time, as the app's worker asks. The minimum of three passes."""
    load_started = time.perf_counter()
    CONFIGS[name]["spin"] = True
    model = load(name, threads)
    model.embed(["warm up"])
    load_s = time.perf_counter() - load_started
    samples = json.load(open(texts_file, encoding="utf-8"))
    report = {"config": name, "threads": threads, "load_s": round(load_s, 2)}
    for kind, texts in samples.items():
        best = None
        for _ in range(3):
            started = time.perf_counter()
            for text in texts:
                model.embed([text])
            elapsed = (time.perf_counter() - started) / len(texts) * 1000
            best = elapsed if best is None else min(best, elapsed)
        report[f"{kind}_ms"] = round(best, 2)
    report["peak_rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576)
    if isinstance(model, GgufModel):
        model.close()
    print(json.dumps(report))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, choices=sorted(CONFIGS))
    parser.add_argument("--texts")
    parser.add_argument("--store")
    parser.add_argument("--threads", type=int, default=6)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--speed")
    args = parser.parse_args()
    if args.smoke:
        return smoke(args.config, args.threads)
    if args.speed:
        return speed(args.config, args.threads, args.speed)
    folder = os.path.join(args.store, args.config)
    os.makedirs(folder, exist_ok=True)
    keys_path = os.path.join(folder, "keys.txt")
    known = set()
    if os.path.exists(keys_path):
        with open(keys_path, encoding="utf-8") as handle:
            known = {line.strip() for line in handle if line.strip()}
    texts = json.load(open(args.texts, encoding="utf-8"))
    seen = set(known)
    todo = []
    for text in texts:
        key = key_of(text)
        if key not in seen:
            seen.add(key)
            todo.append(text)
    todo.sort(key=len)
    print(f"{args.config}: {len(texts)} texts, {len(todo)} to embed", flush=True)
    if not todo:
        return None
    model = load(args.config, args.threads)
    started = time.perf_counter()
    done = 0
    with open(os.path.join(folder, "vectors.f32"), "ab") as vectors, open(
        keys_path, "a", encoding="utf-8"
    ) as keys:
        index = 0
        while index < len(todo):
            # Long texts in smaller batches, so a batch's cost stays about even.
            size = max(4, min(args.batch, int(args.batch * 200 / max(len(todo[index]), 1))))
            batch = todo[index : index + size]
            matrix = model.embed(batch)
            vectors.write(matrix.astype("<f4").tobytes())
            vectors.flush()
            keys.write("".join(key_of(text) + "\n" for text in batch))
            keys.flush()
            index += len(batch)
            done += len(batch)
            if done % 3200 < len(batch):
                rate = done / (time.perf_counter() - started)
                print(f"{args.config}: {done}/{len(todo)}, {rate:.0f} texts/s", flush=True)
    if isinstance(model, GgufModel):
        model.close()
    print(f"{args.config}: done in {time.perf_counter() - started:.0f} s", flush=True)
    return None


if __name__ == "__main__":
    main()
