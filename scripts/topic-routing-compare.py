#!/usr/bin/env python3
"""Compare live topic lines from `scripts/topic-loop-eval.mjs --json` result files.

Usage: python3 -I scripts/topic-routing-compare.py BASE.json OTHER.json [OTHER.json ...]

For each file it prints the lines, the share right and found within 60 s, and the
values that random lines would give: the same number of lines in each meeting,
each with a 120 s window. Then it prints BASE minus each OTHER, in points, with
95% paired meeting-bootstrap intervals. Standard library only.
"""

import json
import random
import sys

WINDOW_S = 120.0
DRAWS = 10000
SEED = 20261121


def meetings(path):
    with open(path) as handle:
        data = json.load(handle)
    out = {}
    for result in data["results"]:
        seconds = result["minutes"] * 60.0
        line = result["liveLine"]
        cuts = line["cuts"]
        changes = result["live"]["refRuns"] - 1
        p = min(1.0, WINDOW_S / seconds)
        out[result["id"]] = {
            "cuts": cuts,
            "right": line["right"],
            "found": len(line["found"]),
            "changes": changes,
            "chance_found": changes * (1 - (1 - p) ** cuts),
            "chance_right": cuts * (1 - (1 - p) ** changes),
        }
    return data["summary"]["label"], out


def shares(arm, ids):
    total = {key: sum(arm[i][key] for i in ids) for key in arm[ids[0]]}
    cuts = total["cuts"] or 1
    changes = total["changes"] or 1
    return {
        "right": total["right"] / cuts,
        "found": total["found"] / changes,
        "right_above": (total["right"] - total["chance_right"]) / cuts,
        "found_above": (total["found"] - total["chance_found"]) / changes,
        "chance_right": total["chance_right"] / cuts,
        "chance_found": total["chance_found"] / changes,
        "total": total,
    }


KEYS = [
    ("right", "right"),
    ("found", "found"),
    ("right_above", "right, above chance"),
    ("found_above", "found, above chance"),
]


def main(paths):
    if len(paths) < 2:
        sys.exit(__doc__)
    arms = [meetings(path) for path in paths]
    ids = sorted(arms[0][1])
    for label, arm in arms:
        if sorted(arm) != ids:
            sys.exit(f"{label}: the meetings differ from {arms[0][0]}")
    for label, arm in arms:
        s = shares(arm, ids)
        t = s["total"]
        print(
            f"{label}: {t['cuts']} lines, right {t['right']} ({100 * s['right']:.1f}%), "
            f"found {t['found']}/{t['changes']} ({100 * s['found']:.1f}%); "
            f"chance right {100 * s['chance_right']:.1f}%, found {100 * s['chance_found']:.1f}%; "
            f"above chance right {100 * s['right_above']:+.1f}, found {100 * s['found_above']:+.1f}"
        )
    base_label, base = arms[0]
    rng = random.Random(SEED)
    samples = [[rng.choice(ids) for _ in ids] for _ in range(DRAWS)]
    for label, arm in arms[1:]:
        print(f"{base_label} minus {label}, points [95% paired meeting bootstrap, {DRAWS} draws]:")
        point_base, point_arm = shares(base, ids), shares(arm, ids)
        draws = []
        for sample in samples:
            a, b = shares(base, sample), shares(arm, sample)
            draws.append({key: a[key] - b[key] for key, _ in KEYS})
        for key, name in KEYS:
            values = sorted(draw[key] for draw in draws)
            low = values[int(0.025 * DRAWS)]
            high = values[int(0.975 * DRAWS) - 1]
            point = point_base[key] - point_arm[key]
            print(f"  {name:<20} {100 * point:+.1f} [{100 * low:+.1f}, {100 * high:+.1f}]")


if __name__ == "__main__":
    main(sys.argv[1:])
