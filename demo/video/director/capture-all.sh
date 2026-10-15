#!/bin/zsh
# Capture every scene of the film and assemble each into public/clips/<name>.mp4,
# with its log beside it. Run from demo/video with the harness up.
#   OATS_SET=ideas zsh director/capture-all.sh   the second film's content:
#   takes in out/capture-ideas/, clips named ideas-<scene>.
set -e
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
set_name=${OATS_SET:-pellwood}
prefix=""
outdir=out/capture
if [[ $set_name != pellwood ]]; then
  prefix="$set_name-"
  outdir="out/capture-$set_name"
fi
# zsh does not split a default word list, so the scenes are an array.
if (( $# )); then
  scenes=("$@")
else
  scenes=(a-record b-timelapse d-questions e-stop f-reading f-connections g-search h-global)
fi
for scene in $scenes; do
  echo "== $prefix$scene $(date +%H:%M:%S)"
  node director/capture.mjs director/scenes/$scene.mjs $outdir/$scene
  node director/assemble.mjs $outdir/$scene public/clips/$prefix$scene.mp4
  cp $outdir/$scene/capture.json public/clips/$prefix$scene.json
done
echo "done $(date +%H:%M:%S)"
