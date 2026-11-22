#!/bin/sh
# With the Vite demo harness running on 127.0.0.1:5467, run from the repo root:
# sh test/browser/featureRoutes.sh [existing-screenshot-directory]
set -eu
export AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-$(agent-browser session id --scope worktree --prefix routes-test)}"
trap 'agent-browser close' EXIT
base='http://127.0.0.1:5467/demo.html?panel=true&parakeet=ready&tier=ready&authorize=0'
row='[...document.querySelectorAll("section[aria-labelledby]")].find(s => s.querySelector("h4")?.textContent === "Dictation")'
prefs='JSON.parse(localStorage.getItem("oats.featureRoutes"))'

button() { agent-browser find role button click --name "$1" --exact; }
expect() { agent-browser wait --fn "$1"; }
models() {
  agent-browser --allowed-domains 127.0.0.1 open "$base&theme=$theme$1"
  agent-browser set viewport 880 680
  expect '[...document.querySelectorAll("button")].some(b => b.getAttribute("aria-label") === "Settings" || b.textContent.trim() === "Settings")'
  button Settings
  button 'AI models'
  expect "!!($row)?.querySelector('p[aria-live]') && document.fonts.status === 'loaded'"
}
capture() {
  if [ "$#" -eq 2 ] && [ -n "$2" ]; then
    agent-browser mouse move 10 10
    agent-browser screenshot "$2/$1-$theme-880x680.png"
  fi
}

for theme in light dark; do
  models ''
  expect "($row).querySelector('p[aria-live]').textContent === 'Whisper Turbo, on this Mac' &&
    [...($row).querySelectorAll('button')].map(b => b.getAttribute('aria-label')).join('|') === 'Dictation: Use an API key'"
  capture all-local "${1:-}"

  models '&keys=openai'
  button 'Dictation: Use an API key'
  expect "$prefs.exceptions.dictation === 'providers' &&
    /^OpenAI .+, with your key$/.test(($row).querySelector('p[aria-live]').textContent)"
  capture cloud-dictation "${1:-}"
  button 'Dictation: Use this Mac'
  expect "$prefs.defaultRoute === 'local' && !('dictation' in $prefs.exceptions)"

  models '&processing=providers&keys=openai'
  button 'Conversations: Use this Mac'
  expect "$prefs.defaultRoute === 'providers' && $prefs.exceptions.conversations === 'local' &&
    [...document.querySelectorAll('section h4')].find(h => h.textContent === 'Conversations')
      .closest('section').querySelector('p[aria-live]').textContent === 'Parakeet Ultra, on this Mac'"
  capture local-conversations "${1:-}"

  models ''
  button 'Dictation: Use an API key'
  expect "$prefs.exceptions.dictation === 'providers' &&
    ($row).querySelectorAll('p').length === 1 &&
    ($row).querySelector('p[aria-live]').textContent === 'Whisper Turbo, on this Mac until you add your OpenAI key' &&
    [...($row).querySelectorAll('button, a, input, [role=switch]')].map(b => b.getAttribute('aria-label')).join('|')
      === 'Dictation: Add API key|Dictation: Keep on this Mac'"
  capture missing-key "${1:-}"
  button 'Dictation: Add API key'
  expect "!!document.querySelector('[role=dialog] input[type=password]')"
  agent-browser press Escape
  expect "document.activeElement.getAttribute('aria-label') === 'Dictation: Add API key'"
  button 'Dictation: Keep on this Mac'
  expect "$prefs.defaultRoute === 'local' && !('dictation' in $prefs.exceptions) &&
    document.activeElement.getAttribute('aria-label') === 'Dictation: Use an API key'"

  models '&processing=providers'
  button 'Dictation: Keep on this Mac'
  expect "$prefs.defaultRoute === 'providers' && $prefs.exceptions.dictation === 'local' &&
    ($row).querySelector('p[aria-live]').textContent === 'Whisper Turbo, on this Mac'"
done
