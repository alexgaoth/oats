#!/usr/bin/env bash
# Rebuilds every Oats icon, on macOS:
#   the app's grain painter (render-brand-icons.cjs, in Electron)
#     -> icon.png (1024), icon.icns, icon.ico
#     -> oats.icon/Assets/ICON.png (the macOS 26 layer)
#   scripts/brand-tray-template.svg -> iconTemplate@3x.png (menu bar, 48px)
#   the DMG window's background -> dmg-background.tiff (1x and 2x in one file)
# Painting keeps the transparency around the tile, the grain's dither matches
# the app's mark and the film, and each size is painted at its own size.
# iconutil packs the .icns.
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

node_modules/.bin/electron scripts/render-brand-icons.cjs "$work"

iconutil -c icns "$work/icon.iconset" -o src/assets/icon.icns
tiffutil -cathidpicheck "$work/dmg/background.png" "$work/dmg/background@2x.png" \
  -out src/assets/dmg-background.tiff >/dev/null

python3 - "$work/ico" src/assets/icon.ico <<'PY'
import os, struct, sys
src, out = sys.argv[1], sys.argv[2]
sizes = [16, 24, 32, 48, 64, 128, 256]
blobs = [open(os.path.join(src, f"{s}.png"), "rb").read() for s in sizes]
header = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
entries = b""
for size, blob in zip(sizes, blobs):
    dim = 0 if size == 256 else size
    entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset)
    offset += len(blob)
open(out, "wb").write(header + entries + b"".join(blobs))
PY

echo "icons rebuilt"
