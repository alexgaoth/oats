#!/bin/sh
# With the Vite demo harness running on 127.0.0.1:5467, run from the repo root:
# sh test/browser/featureRoutes.sh [existing-screenshot-directory]
set -eu
export AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION:-$(agent-browser session id --scope worktree --prefix routes-test)}"
trap 'agent-browser close' EXIT
base='http://127.0.0.1:5467/demo.html?panel=true&parakeet=ready&tier=ready&authorize=0'
row='[...document.querySelectorAll("section[aria-labelledby]")].find(s => s.querySelector("h4")?.textContent === "Dictation")'
prefs='JSON.parse(localStorage.getItem("oats.featureRoutes"))'
cloudButtons='[...document.querySelectorAll("[data-route-action=switch]")].map(b => b.getAttribute("aria-label")).filter(s => s.endsWith("Use an API key")).join("|")'
status='[...document.querySelectorAll("[role=status]")].map(p => p.textContent).join(" ")'

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

save_fixture() {
  agent-browser find label 'Paste an OpenAI or Anthropic key' fill "$1" >/dev/null
  button Save
}

dismiss_dialog() {
  agent-browser press Escape
  expect "!document.querySelector('[role=dialog]')"
}

for theme in light dark; do
  models ''
  expect "($row).querySelector('p[aria-live]').textContent === 'Whisper Turbo, on this Mac' &&
    ($row).querySelectorAll('button, p').length === 1 && $cloudButtons === ''"
  capture all-local "${1:-}"

  button 'Add API key'
  save_fixture 'not-a-provider-fixture'
  expect "$status.includes('Oats works with OpenAI and Anthropic keys.') && $cloudButtons === ''"
  capture unrecognized-key "${1:-}"
  # A short Anthropic prefix must not be sent to OpenAI for validation.
  save_fixture 'sk-ant-1234'
  expect "$status.includes('Oats works with OpenAI and Anthropic keys.') && $cloudButtons === ''"
  save_fixture 'sk-proj-bad-fixture-only'
  expect "!!document.querySelector('[role=dialog] input[aria-invalid=true]') && $cloudButtons === ''"
  save_fixture 'sk-proj-demo-fixture-only'
  expect "$status.includes('Your OpenAI key can run speech and writing in the cloud.')"
  dismiss_dialog
  expect "$cloudButtons === 'Conversations: Use an API key|Dictation: Use an API key|Writing: Use an API key'"
  capture openai-only "${1:-}"

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

  models '&keys=openai'
  button 'Dictation: Use an API key'
  # Remove the demo key through the actual store, without remounting or
  # replacing the saved cloud exception.
  agent-browser eval --stdin <<'JS'
(async () => {
  const url = performance.getEntriesByType("resource")
    .find(entry => new URL(entry.name).pathname === "/stores/settingsStore.ts").name;
  const { useSettingsStore } = await import(url);
  useSettingsStore.getState().setOpenaiApiKey("");
})()
JS
  expect "$prefs.exceptions.dictation === 'providers' &&
    ($row).querySelectorAll('p').length === 1 &&
    ($row).querySelector('p[aria-live]').textContent === 'Whisper Turbo, on this Mac until you add your OpenAI key' &&
    [...($row).querySelectorAll('button, a, input, [role=switch]')].map(b => b.getAttribute('aria-label')).join('|')
      === 'Dictation: Add API key|Dictation: Keep on this Mac'"
  capture missing-key "${1:-}"
  button 'Dictation: Add API key'
  expect "!!document.querySelector('[role=dialog] input[type=password]')"
  dismiss_dialog
  expect "document.activeElement.getAttribute('aria-label') === 'Dictation: Add API key'"
  button 'Dictation: Keep on this Mac'
  expect "$prefs.defaultRoute === 'local' && !('dictation' in $prefs.exceptions) &&
    document.activeElement.textContent === 'Dictation' && $cloudButtons === ''"

  models '&processing=providers'
  expect "$prefs.defaultRoute === 'providers' && !('dictation' in $prefs.exceptions) &&
    ($row).querySelectorAll('button, p').length === 1 &&
    ($row).querySelector('p[aria-live]').textContent === 'Whisper Turbo, on this Mac' && $cloudButtons === ''"

  models ''
  button 'Add API key'
  save_fixture 'sk-ant-demo-fixture-only'
  expect "$status.includes('Your Anthropic key can run writing in the cloud. Anthropic has no speech service, so speech stays on this Mac.')"
  dismiss_dialog
  expect "$cloudButtons === 'Writing: Use an API key'"
  capture anthropic-only "${1:-}"
  button 'Writing: Use an API key'
  expect "$prefs.writingProvider === 'anthropic' && $prefs.exceptions.writing === 'providers'"
  button 'Add API key'
  save_fixture 'sk-proj-demo-fixture-only'
  expect "$status.includes('Your OpenAI key can run speech in the cloud. Anthropic handles cloud writing.')"
  dismiss_dialog
  expect "$cloudButtons === 'Conversations: Use an API key|Dictation: Use an API key' &&
    $prefs.writingProvider === 'anthropic'"
  capture both-keys "${1:-}"

  models '&keys=openai,anthropic'
  expect "$status.includes('Your OpenAI key can run speech in the cloud. OpenAI handles cloud writing.') &&
    $cloudButtons === 'Conversations: Use an API key|Dictation: Use an API key|Writing: Use an API key'"
  button 'Writing: Use an API key'
  expect "$prefs.writingProvider === 'openai'"
done
