#!/bin/zsh
# Capture every scene of the film and assemble each into public/clips/<name>.mp4,
# with its log beside it. Run from demo/video with the harness up.
set -e
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
# zsh does not split a default word list, so the scenes are an array.
if (( $# )); then
  scenes=("$@")
else
  scenes=(a-record b-timelapse c-return d-questions e-stop f-reading f-connections g-search h-global)
fi
for scene in $scenes; do
  echo "== $scene $(date +%H:%M:%S)"
  node director/capture.mjs director/scenes/$scene.mjs out/capture/$scene
  node director/assemble.mjs out/capture/$scene public/clips/$scene.mp4
  cp out/capture/$scene/capture.json public/clips/$scene.json
done
echo "done $(date +%H:%M:%S)"
