#!/usr/bin/env python3
"""Learns the change detector of src/helpers/topicChange.mjs from segmented meetings.

Reads the features of scripts/topic-change-features.mjs (the app's own code), fits
gradient-boosted trees, picks the threshold by cross-validation over meeting groups,
scores it with the replay's Pk, and writes src/helpers/topicChangeModel.mjs.

    python scripts/topic-change-train.py --data ami=DIR --data icsi=DIR [--drop cue,okay,...] \
        [--ami-weight 2] [--trees 150] [--leaves 6] [--rate 0.04] [--near 15] [--spacing 120] \
        [--hold 30] [--write src/helpers/topicChangeModel.mjs]

Needs numpy and lightgbm (PyPI). Public corpora only (AMI, ICSI, both CC BY 4.0).
"""

import argparse
import glob
import json
import os
import re

import lightgbm as lgb
import numpy as np


def load(folder):
    return [json.load(open(path)) for path in sorted(glob.glob(os.path.join(folder, "*.json")))]


def group_of(meeting_id):
    """The people who met: an AMI series (ES2002), or an ICSI series (Bed)."""
    return meeting_id[:-1] if re.search(r"[a-d]$", meeting_id) else meeting_id[:3]


def pk_windowdiff(reference, hypothesis):
    """As pkWindowDiff in scripts/lib/topic-corpus.mjs."""
    n = len(reference)
    segments = 1 + int(np.sum(reference[1:] != reference[:-1]))
    k = max(2, int(np.floor(n / segments / 2 + 0.5)))
    if n <= k:
        return 0.0, 0.0
    ref = np.zeros(n, int)
    ref[1:] = reference[1:] != reference[:-1]
    hyp = np.zeros(n, int)
    hyp[1:] = hypothesis[1:] != hypothesis[:-1]
    ref_sum = np.concatenate([[0], np.cumsum(ref)])
    hyp_sum = np.concatenate([[0], np.cumsum(hyp)])
    index = np.arange(0, n - k)
    r = ref_sum[index + k + 1] - ref_sum[index + 1]
    h = hyp_sum[index + k + 1] - hyp_sum[index + 1]
    return float(np.mean((r > 0) != (h > 0))), float(np.mean(r != h))


def score_cuts(meeting, cuts):
    words = np.array(meeting["words"])
    ids = {}
    labels = np.array([ids.setdefault(label, len(ids)) for label in meeting["labels"]])
    hypothesis = np.zeros(len(labels), int)
    for cut in cuts:
        hypothesis[cut:] += 1
    return pk_windowdiff(np.repeat(labels, words), np.repeat(hypothesis, words))


def causal_cuts(scores, starts, threshold, spacing, hold):
    """As TopicChangeDetector: a pause becomes a cut when `hold` seconds bring no stronger one."""
    cuts = []
    candidate = None
    for gap, score in enumerate(scores):
        turn = gap + 1
        at = starts[turn]
        if candidate is not None and at > starts[candidate] + hold:
            cuts.append(candidate)
            candidate = None
        clear = not cuts or at - starts[cuts[-1]] >= spacing
        if score >= threshold and clear and (candidate is None or score > scores[candidate - 1]):
            candidate = turn
    if candidate is not None:
        cuts.append(candidate)
    return cuts


def matched(meeting, cuts, tolerance=60):
    """Drawn cuts within a minute of a real change, one to one."""
    starts = meeting["starts"]
    real = [starts[cut] for cut in meeting["cuts"]]
    used = set()
    hits = 0
    for cut in cuts:
        best = None
        for index, at in enumerate(real):
            distance = abs(at - starts[cut])
            if index in used or distance > tolerance:
                continue
            if best is None or distance < abs(real[best] - starts[cut]):
                best = index
        if best is not None:
            used.add(best)
            hits += 1
    return hits, len(cuts), len(real)


def targets(meeting, near):
    """1 for a pause within `near` seconds of a change of subject."""
    starts = np.array(meeting["starts"])
    out = np.zeros(len(meeting["rows"]), int)
    times = starts[1:]
    for cut in meeting["cuts"]:
        out[np.abs(times - starts[cut]) <= near] = 1
    return out


def assemble(sets, near, drop):
    names = [name for name in sets[0][1][0]["features"] if name not in drop]
    keep = [sets[0][1][0]["features"].index(name) for name in names]
    X, y, meeting_of, groups, domain, meetings = [], [], [], [], [], []
    for index, (_, items) in enumerate(sets):
        for meeting in items:
            rows = np.array(meeting["rows"], float)[:, keep]
            X.append(rows)
            y.append(targets(meeting, near))
            meeting_of += [len(meetings)] * len(rows)
            groups += [group_of(meeting["id"])] * len(rows)
            domain += [index] * len(rows)
            meetings.append(meeting)
    return (
        np.vstack(X),
        np.concatenate(y),
        np.array(meeting_of),
        np.array(groups),
        np.array(domain),
        meetings,
        names,
    )


def fit(X, y, weight, opts):
    params = dict(
        n_estimators=opts.trees,
        learning_rate=opts.rate,
        num_leaves=opts.leaves,
        min_child_samples=60,
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.6,
        verbose=-1,
        n_jobs=opts.jobs,
        random_state=1,
    )
    return lgb.LGBMClassifier(**params).fit(X, y, sample_weight=weight)


def folds(groups, count=6):
    names = sorted(set(groups))
    rng = np.random.default_rng(1)
    rng.shuffle(names)
    for fold in range(count):
        held = set(names[fold::count])
        test = np.array([group in held for group in groups])
        yield np.where(~test)[0], np.where(test)[0]


def export(model, names, threshold, opts):
    dump = model.booster_.dump_model()
    trees = []
    base = 0.0
    for info in dump["tree_info"]:
        root = info["tree_structure"]
        if "leaf_value" in root:
            base += root["leaf_value"]
            continue
        f, t, l, r, v = [], [], [], [], []

        def walk(node):
            if "leaf_value" in node:
                v.append(round(node["leaf_value"], 5))
                return -len(v)
            index = len(f)
            f.append(node["split_feature"])
            t.append(round(node["threshold"], 6))
            l.append(0)
            r.append(0)
            l[index] = walk(node["left_child"])
            r[index] = walk(node["right_child"])
            return index

        walk(root)
        trees.append({"f": f, "t": t, "l": l, "r": r, "v": v})
    body = json.dumps(
        {"features": names, "threshold": round(float(threshold), 4), "base": round(base, 5), "trees": trees},
        separators=(",", ":"),
    )
    with open(opts.write, "w") as out:
        out.write("// Generated by scripts/topic-change-train.py. Do not edit by hand.\n")
        out.write("//\n")
        out.write("// Decision trees for the change detector (topicChange.mjs): for each pause, the\n")
        out.write("// chance that the subject changes near it. Learned from where people marked the\n")
        out.write("// topics of meetings: the AMI meeting corpus and the ICSI meeting corpus, manual\n")
        out.write("// annotations, each under Creative Commons Attribution 4.0\n")
        out.write("// (https://creativecommons.org/licenses/by/4.0/). No text of them is in here.\n")
        out.write("//\n")
        out.write("// prettier-ignore\n")
        out.write(f"export const CHANGE_MODEL = {body};\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", action="append", required=True)
    parser.add_argument("--drop", default="")
    parser.add_argument("--ami-weight", type=float, default=2.0)
    parser.add_argument("--trees", type=int, default=150)
    parser.add_argument("--leaves", type=int, default=6)
    parser.add_argument("--rate", type=float, default=0.04)
    parser.add_argument("--near", type=float, default=15)
    parser.add_argument("--spacing", type=float, default=120)
    parser.add_argument("--hold", type=float, default=30)
    parser.add_argument("--jobs", type=int, default=6)
    parser.add_argument("--write")
    parser.add_argument("--curve", action="store_true")
    parser.add_argument("--exclude", default="", help="meetings left out of everything")
    parser.add_argument("--score", action="append", default=[], help="name=DIR: meetings to score, each by the fold that held its group out")
    parser.add_argument("--threshold", type=float)
    opts = parser.parse_args()
    excluded = set(filter(None, opts.exclude.split(",")))
    sets = [
        (item.split("=")[0], [m for m in load(item.split("=")[1]) if m["id"] not in excluded])
        for item in opts.data
    ]
    drop = set(filter(None, opts.drop.split(",")))
    X, y, meeting_of, groups, domain, meetings, names = assemble(sets, opts.near, drop)
    weight = np.where(domain == 0, opts.ami_weight, 1.0)
    scores = np.zeros(len(y))
    extras = [(item.split("=")[0], load(item.split("=")[1])) for item in opts.score]
    extra_scores = {}
    keep = [sets[0][1][0]["features"].index(name) for name in names]
    for train, test in folds(groups):
        model = fit(X[train], y[train], weight[train], opts)
        scores[test] = model.predict_proba(X[test])[:, 1]
        held = set(groups[test])
        for name, items in extras:
            for meeting in items:
                if group_of(meeting["id"]) in held:
                    rows = np.array(meeting["rows"], float)[:, keep]
                    extra_scores[(name, meeting["id"])] = model.predict_proba(rows)[:, 1]
    one = [np.mean([score_cuts(m, [])[0] for m in items]) for _, items in sets]
    best = None
    rows = []
    for threshold in np.unique(np.quantile(scores, [0.85, 0.88, 0.9, 0.92, 0.94, 0.95, 0.96, 0.97, 0.975, 0.98, 0.985, 0.99, 0.993])):
        pks, counts, gain = [], [], 0.0
        for index, (_, items) in enumerate(sets):
            ids = [i for i, m in enumerate(meetings) if m in items] if len(sets) > 1 else list(range(len(meetings)))
            values = []
            cuts_count = []
            hits = np.zeros(3)
            for i in ids:
                part = scores[meeting_of == i]
                cuts = causal_cuts(part, meetings[i]["starts"], threshold, opts.spacing, opts.hold)
                values.append(score_cuts(meetings[i], cuts)[0])
                cuts_count.append(len(cuts))
                hits += matched(meetings[i], cuts)
            pks.append(float(np.mean(values)))
            counts.append(float(np.mean(cuts_count)))
            gain += (one[index] - pks[-1]) / one[index]
            if opts.curve:
                print(
                    f"thr {threshold:.3f} {sets[index][0]}: Pk {pks[-1]:.3f} cuts {counts[-1]:.1f} "
                    f"P {hits[0] / max(1, hits[1]):.2f} R {hits[0] / max(1, hits[2]):.2f}"
                )
        rows.append((gain, threshold, pks, counts))
        if best is None or gain > best[0]:
            best = rows[-1]
    gain, threshold, pks, counts = best
    if opts.threshold is not None:
        gain, threshold, pks, counts = min(rows, key=lambda row: abs(row[1] - opts.threshold))
    text = "  ".join(f"{name} Pk {pk:.3f} (one topic {o:.3f}), {count:.1f} cuts" for (name, _), pk, o, count in zip(sets, pks, one, counts))
    print(f"held-out groups, threshold {threshold:.3f}: {text}")
    for name, items in extras:
        pks, ones, wds, counts = [], [], [], []
        for meeting in items:
            part = extra_scores[(name, meeting["id"])]
            cuts = causal_cuts(part, meeting["starts"], threshold, opts.spacing, opts.hold)
            pk, wd = score_cuts(meeting, cuts)
            pks.append(pk)
            wds.append(wd)
            ones.append(score_cuts(meeting, [])[0])
            counts.append(len(cuts))
        print(f"{name}: Pk {np.mean(pks):.3f} WD {np.mean(wds):.3f} (one topic {np.mean(ones):.3f}), {np.mean(counts):.1f} cuts")
    if opts.write:
        model = fit(X, y, weight, opts)
        export(model, names, threshold, opts)
        print(f"wrote {opts.write}: {len(names)} features, {opts.trees} trees")


if __name__ == "__main__":
    main()
