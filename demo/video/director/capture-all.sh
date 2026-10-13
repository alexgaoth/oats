#!/bin/zsh
# Capture every scene of the film and assemble each into public/clips/<name>.mp4,
# with its log beside it. Run from demo/video with the harness up.
set -e
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
for scene in ${@:-a-record b-timelapse c-graph d-questions e-stop f-reading g-search h-map}; do
  echo "== $scene $(date +%H:%M:%S)"
  node director/capture.mjs director/scenes/$scene.mjs out/capture/$scene
  node director/assemble.mjs out/capture/$scene public/clips/$scene.mp4
  cp out/capture/$scene/capture.json public/clips/$scene.json
done
echo "done $(date +%H:%M:%S)"
