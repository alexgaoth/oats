#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "This script will stop Oats, remove the installed app, and delete caches, databases, and preferences."
read -r -p "Continue with the full uninstall? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

remove_target() {
  local target="$1"
  if [[ -e "$target" ]]; then
    echo "Removing $target"
    rm -rf "$target" 2>/dev/null || sudo rm -rf "$target"
  fi
}

echo "Stopping running Oats/Electron processes..."
pkill -f "Oats" 2>/dev/null || true
pkill -f "open-whispr" 2>/dev/null || true
pkill -f "Electron Helper.*Oats" 2>/dev/null || true

echo "Removing /Applications/Oats.app (requires admin)..."
remove_target "/Applications/Oats.app"

echo "Purging Application Support data..."
remove_target "$HOME/Library/Application Support/Oats"
remove_target "$HOME/Library/Application Support/open-whispr"
remove_target "$HOME/Library/Application Support/Oats-dev"
remove_target "$HOME/Library/Application Support/com.arum.oats"
remove_target "$HOME/Library/Application Support/com.arum.oats"

echo "Removing caches, logs, and saved state..."
remove_target "$HOME/Library/Caches/open-whispr"
remove_target "$HOME/Library/Caches/com.arum.oats"
remove_target "$HOME/Library/Preferences/com.arum.oats.plist"
remove_target "$HOME/Library/Preferences/com.arum.oats.helper.plist"
remove_target "$HOME/Library/Logs/Oats"
remove_target "$HOME/Library/Saved Application State/com.arum.oats.savedState"

echo "Cleaning temporary files..."
shopt -s nullglob
for tmp in /tmp/oats*; do
  remove_target "$tmp"
done
for crash in "$HOME/Library/Application Support/CrashReporter"/Oats_*; do
  remove_target "$crash"
done
shopt -u nullglob

read -r -p "Remove downloaded Whisper models and caches (~/.cache/whisper, ~/Library/Application Support/whisper)? [y/N]: " wipe_models
if [[ "$wipe_models" =~ ^[Yy]$ ]]; then
  remove_target "$HOME/.cache/whisper"
  remove_target "$HOME/Library/Application Support/whisper"
  remove_target "$HOME/Library/Application Support/Oats/models"
fi

ENV_FILE="$PROJECT_ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  read -r -p "Remove the local environment file at $ENV_FILE? [y/N]: " wipe_env
  if [[ "$wipe_env" =~ ^[Yy]$ ]]; then
    echo "Removing $ENV_FILE"
    rm -f "$ENV_FILE"
  fi
fi

cat <<'EOF'
macOS keeps microphone, screen recording, and accessibility approvals even after files are removed.
Reset them if you want a truly fresh start:
  tccutil reset Microphone com.arum.oats
  tccutil reset Accessibility com.arum.oats
  tccutil reset ScreenCapture com.arum.oats

Full uninstall complete. Reboot if you removed permissions, then reinstall or run npm scripts on a clean tree.
EOF
