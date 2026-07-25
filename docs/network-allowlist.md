# Oats network allowlist

Oats has no required outbound connection. A fresh install can record, transcribe
with its bundled Whisper base model, create a note, and show the conversation
Graph while offline.

No OpenWhispr service, account service, analytics endpoint, calendar service, or
automatic update feed is contacted. v1 updates are signed manual downloads.

## Explicit user actions

| Host                                                                                                      | When it is contacted                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Your configured search host (Google by default)                                                           | Only after selecting Search from an aide card or Graph node. Oats opens the encoded HTTPS URL in the browser; it does not fetch results. |
| `huggingface.co` and its LFS/CDN hosts                                                                    | Downloading an optional speech, embedding, or reasoning model, or creating a release bundle.                                             |
| `github.com` and `objects.githubusercontent.com`                                                          | Downloading an optional runtime helper or a signed release manually.                                                                     |
| A provider selected by the user (OpenAI, Anthropic, Gemini, Groq, Mistral, Tinfoil, or a custom endpoint) | Only after the user adds a key and selects that provider.                                                                                |

The exact provider hostname is controlled by that provider or by the user's
custom endpoint. Local, LAN, and bundled-model paths do not require this access.

## Release verification

Before a release, capture a fresh-offline session and an online session with no
provider keys configured. Neither should create a connection. Then repeat with
one deliberate action at a time (model download, search click, optional BYOK
request) and record only the expected destination above.

Useful host-level checks include `ss -tp` on Fedora and a per-process firewall or
network monitor on macOS. Keep the resulting capture and idle CPU/memory figures
with the release notes.
