#!/usr/bin/env python3
"""
YTSeg (retkowski/ytseg on Hugging Face, CC BY-NC-SA 4.0) as recordings with a
reference for `scripts/topic-loop-eval.mjs --referenced`: YouTube videos with
the chapters their makers drew, as talks (one speaker) and two people talking.
The licence allows measuring with it, not training a model the app ships.

  python scripts/ytseg-referenced.py text --parquet text-validation.parquet --kind talk --out DIR
  python scripts/ytseg-referenced.py list --parquet text-validation.parquet --kind two --out list.json
  python scripts/ytseg-referenced.py asr  --list list.json --published DIR --out DIR

  text  each video's Whisper-large sentences as turns. YTSeg has no time per
        sentence, so a sentence starts where its words fall at the video's
        average rate: the reference and the drawn changes share that clock,
        and a pause carries nothing. Quick, and many videos.
  list  the videos chosen, for the audio: id, mp3 path in the dataset, length,
        chapter starts and titles.
  asr   the segments `scripts/room-replay.js --publish` wrote for each mp3, each
        given the chapter its start falls in: what the app hears, with true times.

Chosen (--kind): 5 to 60 minutes (--max-minutes), at least two chapter changes, chapters of 2
minutes or more on average (the detector keeps 90 s between cuts). `talk`: one
speaker; `two`: two speakers, both talking. A fixed shuffle (--seed) and --limit
pick the sample. Needs pyarrow.
"""
import argparse
import hashlib
import json
import os

import pyarrow.parquet as pq

COLUMNS = [
    "video_id", "channel_id", "speaker_category", "num_speakers", "duration",
    "chapter_timestamps", "chapter_titles", "text_wl", "target_binary_wl", "audio_path",
]
PAUSE_S = 0.3


def chosen(row, kind, longest=60):
    minutes = row["duration"] / 60
    changes = len(row["chapter_timestamps"])
    if not (5 <= minutes <= longest and changes >= 2 and minutes / (changes + 1) >= 2):
        return False
    if kind == "talk":
        return row["speaker_category"] == "single" and row["num_speakers"] == 1
    return row["speaker_category"] == "multi" and row["num_speakers"] == 2


def sample(parquet, kind, seed, limit, longest=60):
    rows = [
        row for row in pq.read_table(parquet, columns=COLUMNS).to_pylist()
        if chosen(row, kind, longest)
    ]
    labels = lambda row: row["target_binary_wl"][2:]
    # A video whose labels do not match its chapters (18 of 1447 in validation) is left out.
    rows = [
        row for row in rows
        if len(labels(row)) == len(row["text_wl"])
        and labels(row).count("1") == len(row["chapter_timestamps"])
    ]
    rows.sort(key=lambda row: hashlib.sha256(f"{seed}:{row['video_id']}".encode()).hexdigest())
    return rows[:limit] if limit else rows


def sections(row):
    titles = row["chapter_titles"]
    return {f"c{index}": title for index, title in enumerate(titles)}


def text_recording(row, kind):
    sentences = row["text_wl"]
    words = [max(1, len(sentence.split())) for sentence in sentences]
    seconds_per_word = row["duration"] / sum(words)
    segments, said, chapter = [], 0, 0
    for index, (sentence, count, label) in enumerate(zip(sentences, words, row["target_binary_wl"][2:])):
        if label == "1":
            chapter += 1
        start = said * seconds_per_word
        said += count
        end = max(start + 0.1, said * seconds_per_word - PAUSE_S)
        segments.append({
            "id": f"s{index + 1}", "text": sentence, "startMs": round(start * 1000),
            "endMs": round(end * 1000), "ref": f"c{chapter}",
        })
    return {"id": row["video_id"], "source": f"ytseg-{kind}-text", "sections": sections(row), "segments": segments}


def asr_recording(entry, published, kind):
    name = os.path.splitext(os.path.basename(entry["audio_path"]))[0]
    with open(os.path.join(published, f"{name}.json")) as handle:
        replay = json.load(handle)
    starts = entry["chapter_timestamps"]
    segments = []
    for index, segment in enumerate(s for s in replay["segments"] if s["text"].strip()):
        chapter = sum(1 for at in starts if segment["start"] >= at)
        segments.append({
            "id": f"u{index + 1}", "text": segment["text"].strip(),
            "startMs": round(segment["start"] * 1000), "endMs": round(segment["end"] * 1000),
            "ref": f"c{chapter}",
        })
    return {"id": entry["video_id"], "source": f"ytseg-{kind}-asr", "sections": entry["sections"], "segments": segments}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["text", "list", "asr"])
    parser.add_argument("--parquet")
    parser.add_argument("--list")
    parser.add_argument("--published")
    parser.add_argument("--kind", choices=["talk", "two"], default="talk")
    parser.add_argument("--seed", default="oats")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--max-minutes", type=float, default=60)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    if args.mode == "asr":
        with open(args.list) as handle:
            entries = json.load(handle)
        os.makedirs(args.out, exist_ok=True)
        for entry in entries:
            recording = asr_recording(entry, args.published, entry.get("kind", args.kind))
            with open(os.path.join(args.out, f"{entry['video_id']}.json"), "w") as handle:
                json.dump(recording, handle)
        print(f"{len(entries)} recordings")
        return
    rows = sample(args.parquet, args.kind, args.seed, args.limit, args.max_minutes)
    if args.mode == "list":
        entries = [{
            "video_id": row["video_id"], "kind": args.kind, "audio_path": row["audio_path"],
            "duration": row["duration"], "chapter_timestamps": row["chapter_timestamps"],
            "sections": sections(row),
        } for row in rows]
        with open(args.out, "w") as handle:
            json.dump(entries, handle, indent=1)
    else:
        os.makedirs(args.out, exist_ok=True)
        for row in rows:
            with open(os.path.join(args.out, f"{row['video_id']}.json"), "w") as handle:
                json.dump(text_recording(row, args.kind), handle)
    hours = sum(row["duration"] for row in rows) / 3600
    changes = sum(len(row["chapter_timestamps"]) for row in rows)
    print(f"{len(rows)} videos, {hours:.1f} h, {changes} chapter changes")


if __name__ == "__main__":
    main()
