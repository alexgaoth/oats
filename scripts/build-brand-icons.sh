#!/usr/bin/env bash
# Rebuilds every Oats icon from its SVG master, on macOS:
#   src/assets/logo.svg            -> icon.png (1024), icon.icns, icon.ico
#   scripts/brand-grain-layer.svg  -> oats.icon/Assets/ICON.png (macOS 26 layer)
#   scripts/brand-tray-template.svg -> iconTemplate@3x.png (menu bar, 48px)
# Uses Quick Look (qlmanage) to render SVG, sips to resize, iconutil for .icns.
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
render() { qlmanage -t -s 1024 -o "$work" "$1" >/dev/null 2>&1; echo "$work/$(basename "$1").png"; }

icon="$(render src/assets/logo.svg)"
cp "$icon" src/assets/icon.png

set_dir="$work/icon.iconset"
mkdir -p "$set_dir"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$icon" --out "$set_dir/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$icon" --out "$set_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$set_dir" -o src/assets/icon.icns

ico_dir="$work/ico"
mkdir -p "$ico_dir"
for size in 16 24 32 48 64 128 256; do
  sips -z "$size" "$size" "$icon" --out "$ico_dir/$size.png" >/dev/null
done
python3 - "$ico_dir" src/assets/icon.ico <<'PY'
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

layer="$(render scripts/brand-grain-layer.svg)"
cp "$layer" src/assets/oats.icon/Assets/ICON.png

tray="$(render scripts/brand-tray-template.svg)"
sips -Z 48 "$tray" --out src/assets/iconTemplate@3x.png >/dev/null

echo "icons rebuilt"
