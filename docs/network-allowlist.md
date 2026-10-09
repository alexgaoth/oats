# Oats network allowlist

Oats can run a complete conversation offline: a fresh install records, transcribes
with its bundled Whisper base model, catches questions, creates a note, and shows
the conversation structure with no connection at all.

**Audio, transcripts, and summaries never leave the device.** No OpenWhispr
service, account service, analytics endpoint, calendar service, or automatic
update feed is contacted. v1 updates are signed manual downloads.

One outbound action is **on by default**: the question search below. It is the
only default-on connection in the product, and it is switchable off in Settings.

**Nothing is downloaded at launch.** Every model a conversation needs ships in
the app: Whisper `base` and `base.en`, the Silero VAD, pyannote segmentation,
TitaNet for speakers, and MiniLM for search. A development checkout fetches the
ones it is missing; a packaged build never does. The local vector store (Qdrant)
listens on 127.0.0.1 only and runs with its anonymous usage statistics turned
off, by config and by flag (`src/helpers/qdrantManager.js`). Nothing of the
builder's machine is packed into the app — in particular no `.env`. All of this
is pinned in `test/helpers/networkBoundary.test.js`.

## Default-on

| Host                                            | What is sent                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your configured search host (Google by default) | **The text of a question only.** Triggered only by a _confirmed negative_ — a detected question that somebody was asked and answered with “I don't know”, above the confidence threshold. Oats opens an encoded HTTPS URL in the browser; it never fetches or scrapes results. |

Scope limits that make this safe to state plainly:

- Only the question text is sent — never audio, never surrounding transcript,
  never the summary, never a conversation or device identifier.
- Answered questions never trigger a search.
- Neither does silence, nor a hedged answer, nor a low-confidence denial. Each of
  those records its outcome on the card and stops there.
- The URL is host-validated and HTTPS-only, built by `buildSearchUrl` and checked
  by `validateSearchUrl` in `src/helpers/conversationAide.mjs`.
- Oats hands the URL to the system browser and does not read the response. It
  asks `xdg-settings` for the default browser so the result can open in its own
  window rather than as a tab in whatever window was last focused; that is a
  local lookup, not a network call, and the destination host is unchanged.
- Turning off auto-search in Settings restores click-only behavior; question
  cards still appear and are still recorded.

## Explicit user actions

| Host                                                                                                      | When it is contacted                                                                         |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Your configured search host                                                                               | Re-running a search manually from a question card or a topic-graph node.                     |
| `huggingface.co` and its LFS/CDN hosts                                                                    | Downloading an optional speech, embedding, or reasoning model, or creating a release bundle. |
| `github.com` and `objects.githubusercontent.com`                                                          | Downloading an optional runtime helper or a signed release manually.                         |
| A provider selected by the user (OpenAI, Anthropic, Gemini, Groq, Mistral, Tinfoil, or a custom endpoint) | Only after the user adds a key and selects that provider.                                    |

The exact provider hostname is controlled by that provider or by the user's
custom endpoint. Local, LAN, and bundled-model paths do not require this access.

## Release verification

Before a release, capture a fresh-offline session and an online session with no
provider keys configured and auto-search disabled. Neither should create a
connection. Then repeat with one deliberate action at a time (model download,
manual search, optional BYOK request) and record only the expected destination
above.

Then run the auto-search case explicitly: with it enabled, record a conversation
containing one answered and one unanswered question, and confirm the capture shows
**exactly one** search request, carrying only the unanswered question's text.

Useful host-level checks include `ss -tp` on Fedora and a per-process firewall or
network monitor on macOS. Keep the resulting capture and idle CPU/memory figures
with the release notes.
