#!/usr/bin/env python3
"""Out-of-fold scores of a change detector learned for an early read: the same
features, trees and settings as scripts/topic-change-train.py, with the far side
of each pause cut to r s (topic-change-features.mjs --lag r).

    python scripts/topic-early-train.py --data ami=DIR --data icsi=DIR --out DIR \
        [--ami-weight 2] [--trees 150] [--leaves 6] [--rate 0.04] [--near 15]

Writes <out>/<meeting>.json: {"id", "scores"}, one score for each pause (the
pause before turn g is scores[g - 1]). Each meeting is scored by the fold that
held its group out, so no meeting is scored by trees that saw it.
scripts/topic-early-eval.mjs reads them with --early r=DIR. Public corpora only.
"""

import argparse
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("change_train", os.path.join(HERE, "topic-change-train.py"))
train = importlib.util.module_from_spec(spec)
spec.loader.exec_module(train)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", action="append", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--ami-weight", type=float, default=2.0)
    parser.add_argument("--trees", type=int, default=150)
    parser.add_argument("--leaves", type=int, default=6)
    parser.add_argument("--rate", type=float, default=0.04)
    parser.add_argument("--near", type=float, default=15)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument(
        "--apply",
        action="append",
        default=[],
        help="r=DIR: also score these features (another --lag) with each fold's trees, into <out>-apply<r>",
    )
    opts = parser.parse_args()
    sets = [(item.split("=")[0], train.load(item.split("=")[1])) for item in opts.data]
    X, y, meeting_of, groups, domain, meetings, names = train.assemble(sets, opts.near, set())
    weight = np.where(domain == 0, opts.ami_weight, 1.0)
    scores = np.zeros(len(y))
    applied = [(item.split("=")[0], train.load(item.split("=")[1])) for item in opts.apply]
    keep = [sets[0][1][0]["features"].index(name) for name in names]
    applied_scores = {}
    for fit_rows, test_rows in train.folds(groups):
        model = train.fit(X[fit_rows], y[fit_rows], weight[fit_rows], opts)
        scores[test_rows] = model.predict_proba(X[test_rows])[:, 1]
        held = set(groups[test_rows])
        for lag, items in applied:
            for meeting in items:
                if train.group_of(meeting["id"]) in held:
                    rows = np.array(meeting["rows"], float)[:, keep]
                    applied_scores[(lag, meeting["id"])] = model.predict_proba(rows)[:, 1]
    for (lag, meeting_id), part in applied_scores.items():
        folder = f"{opts.out.rstrip('/')}-apply{lag}"
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, f"{meeting_id}.json"), "w") as handle:
            json.dump({"id": meeting_id, "scores": [round(float(v), 5) for v in part]}, handle)
    os.makedirs(opts.out, exist_ok=True)
    for index, meeting in enumerate(meetings):
        part = scores[meeting_of == index]
        with open(os.path.join(opts.out, f"{meeting['id']}.json"), "w") as handle:
            json.dump({"id": meeting["id"], "scores": [round(float(v), 5) for v in part]}, handle)
    print(f"{len(meetings)} meetings, {len(y)} pauses, {int(y.sum())} near a change, {len(names)} features")


if __name__ == "__main__":
    main()
