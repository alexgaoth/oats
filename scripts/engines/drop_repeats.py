#!/usr/bin/env python3
"""Drop a segment's first word when it repeats the last word heard before it. usage: drop_repeats.py <run.json> <out.json>, then score out.json with room-replay.js --from-run"""
import json, re, sys
src, out = sys.argv[1:3]
d = json.load(open(src))
norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())
dropped = 0
for r in d['recordings']:
    last = None
    for s in r['segments']:
        words = (s.get('text') or '').split()
        if not words:
            continue
        if last is not None and norm(words[0]) and norm(words[0]) == last:
            words = words[1:]
            dropped += 1
            s['text'] = ' '.join(words)
        if words:
            last = norm(words[-1])
json.dump(d, open(out, 'w'))
print(out.split('/')[-1], 'dropped', dropped)
