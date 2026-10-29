# Oats network allowlist

Oats can run a complete conversation offline: a fresh install records, transcribes
with its bundled Whisper models (`small.en` and `base` on Apple Silicon, `base.en`
and `base` elsewhere), catches questions, creates a note, and shows the
conversation structure with no connection at all.

**Audio, transcripts, and summaries never leave the device.** No OpenWhispr
service, account service, analytics endpoint, calendar service, or automatic
update feed is contacted. v1 updates are signed manual downloads.

One outbound action is **on by default**: the question search below. It is the
only default-on connection in the product, and it is switchable off in Settings.

**Nothing is downloaded at launch, with one exception after setup.** Every
model a conversation needs ships in the app: Whisper `base` and `base.en`
(`small.en` and `base` on Apple Silicon), the Silero VAD, pyannote
segmentation, TitaNet for speakers, and MiniLM for search. A development
checkout fetches the ones it is missing; a packaged build does not. The one
exception: on a Mac whose GPU measures fast enough, Oats downloads Whisper
Turbo once, after setup (below, "Automatic, once"). The local vector store
(Qdrant) listens on 127.0.0.1 only and runs with its anonymous usage
statistics turned off, by config and by flag (`src/helpers/qdrantManager.js`).
Nothing of the builder's machine is packed into the app — in particular no
`.env`. All of this is pinned in `test/helpers/networkBoundary.test.js`.

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

## Automatic, once: Whisper Turbo on a fast Mac

| Host                                   | What is fetched                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `huggingface.co` and its LFS/CDN hosts | `ggml-large-v3-turbo-q5_0.bin` (574 MB) from `ggerganov/whisper.cpp`, the repository of every other Whisper model. Nothing is sent but the request for the file. |

At first launch and after each update, Oats times one 5-second clip on this
Mac's GPU, on its own speech server, with no connection
(`src/helpers/deviceTier.js`). When the result says the Mac can run
`large-v3-turbo` live (`src/helpers/speechTier.mjs`), Oats downloads it once
setup is done, and only while the speech model follows the default: a model
the person chose stops it. It never starts while a conversation is
recorded: it waits for the recording to end. The setup screen says so once
the check is done (a second or two after launch). When the download starts,
a notice in the corner says so once, with its size, its host and a Cancel
button: after setup on a new install, and at the first launch of this
version on an existing one, which never sees the setup screen. The sidebar
and Settings › Models show its progress with a Cancel button, and the
sidebar's request count includes it (it goes through `downloadUtils.js`, like
every model download). Its SHA-256 is checked before it is used. A cancelled
or deleted Turbo is not fetched again unless the person asks for it in
Settings. A failed download is tried again at the next launch. Intel Macs,
Linux, and Macs that measure too slow never fetch it.

## Explicit user actions

| Host                                                                                                      | When it is contacted                                                                         |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Your configured search host                                                                               | Re-running a search manually from a question card or a topic-graph node.                     |
| `huggingface.co` and its LFS/CDN hosts                                                                    | Downloading an optional speech, embedding, or reasoning model, or creating a release bundle. |
| `github.com` and `objects.githubusercontent.com`                                                          | Downloading an optional runtime helper or a signed release manually.                         |
| A provider selected by the user (OpenAI, Anthropic, Gemini, Groq, Mistral, Tinfoil, or a custom endpoint) | Only after the user adds a key and selects that provider.                                    |

The exact provider hostname is controlled by that provider or by the user's
custom endpoint. Local, LAN, and bundled-model paths do not require this access.
A request to an Anthropic model that has Anthropic's server-side refusal
fallback (Opus 5 and 5.5, Fable 5.x, and Sonnet 5.5 with thinking on) asks for
it: a request that Anthropic's safety classifiers decline is answered instead by
the model Anthropic picks for that kind of refusal, on the same host
(`src/helpers/anthropicMessages.js`).

A conversation's summary goes to the writing model, by its route, at Finish.
When no writing model is ready then (none chosen yet, or the one on this
computer still downloading), the conversation waits, and is summarized by the
same route once one is (`src/stores/summaryQueueStore.ts`): by a model on this
computer or the person's own server, always; by a cloud provider only if it was
already the writing model when the conversation finished. A provider chosen
since gets an earlier conversation only when somebody opens it. A summary that
fails is asked for once more, after 10 seconds.

Choosing a conversation's group (Work, Personal, or the person's own) uses the
writing model that wrote its summary, by the same route, so it adds no
destination. After each summary, the model gets one more short request: the
title, the topic labels and the opening of the summary, never the transcript
(`src/helpers/conversationGroupSort.mjs`). Conversations from before are sorted
in the background only by a model on this computer or the user's own server.
With a cloud provider selected, they are not sent: they may have been
summarized on this computer, before that provider was chosen.

Naming a conversation's topics goes by the writing model's route, so it adds no
destination. Topics are always found and named on this computer; when a writing
model is chosen and ready, a model gives each topic a better name: with OpenAI
or Anthropic as the writing model, that provider's most accurate model for
names when the key can use it (`src/helpers/topicModels.mjs`: OpenAI's
gpt-6-astra, else gpt-6.1-sol or gpt-6.1-terra; Anthropic's claude-opus-5-5,
else claude-sonnet-5-5), by the same key and to the same host; with any other
route, the writing model itself. Once per app session Oats asks OpenAI or
Anthropic whether the key can use the naming model (`GET /v1/models/{model}`, no
conversation text; with no key, nothing is sent). The model gets one short
request per topic when the topic holds 40 words, again each time the topic has
grown two and a half times (100, 250, 625 words, and so
on), and at the end for a topic that is new or changed since: the names the
other topics already have, and at most 3,000 characters of what was said on
that topic (`src/helpers/topicNaming.mjs`), never audio and never the rest of
the transcript. One request is out at a time. With a model on this computer,
nothing leaves (and when the question cards use a classifier model of their
own, the names wait for the end, so the two models do not take turns loading).
With a cloud provider selected, these requests go to the provider during the
conversation, and the sidebar counts them like any renderer request. With no
writing model, or one that is not ready, nothing is sent and the topics keep
their on-device names (`src/stores/topicNamingRunner.ts`). With OpenAI or
Anthropic as the writing model, the live topic check below names the topics
while recording instead, and these requests go out only at the end, for the
record's topics it did not name.

The live topic check runs only with OpenAI or Anthropic as the writing model
and that provider's key, and goes to the same host by the same key, so it adds
no destination either (`src/helpers/topicLoop.mjs`). During the conversation,
the on-device tracker proposes changes of subject, and that provider's most
accurate model for the check confirms each proposed change and names the new
topic (`src/helpers/topicModels.mjs`): with OpenAI, gpt-5.6-terra with
reasoning off, else gpt-6.1-terra, gpt-6.1-sol, gpt-6-luna or gpt-5.6-luna;
with Anthropic, claude-opus-5-5 at effort low, else claude-haiku-5-5. Once per
app session Oats asks the provider whether the key can use them (`GET
/v1/models/{model}`, no conversation text; with no key, nothing is sent). Each
request carries the topics' names and one-line descriptions and at most 3,000
characters of what was said around the proposed change (or at the end of a
topic that ran 250 words with no change), never audio. About 40 to 50 requests
an hour (never more than 120), one at a time. Each request carries a small
part, but together they quote most of the conversation: 91 to 95% of its lines
on 24 test meetings. The sidebar counts them like any other request (the
Anthropic route's go out from the main process, through Chromium's network
stack). After three failed requests in a row, or when the writing model is no
longer that provider's, the check stops for that recording. With Anthropic,
the check asks for the refusal fallback above. With any other provider, a
custom endpoint, a server of the person's own or a model on this computer, the
check is off and nothing changes.

Linking conversations on the Global conversations board happens on this
computer: each topic name is embedded by the bundled all-MiniLM-L6-v2, and
nothing leaves (`src/helpers/conversationLinks.mjs`). With OpenAI or Anthropic
as the writing model, a cloud model also checks the links of each conversation
once it is summarized, by the summary's route and key, so it adds no
destination (`src/stores/conversationLinkStore.ts`,
`src/helpers/remoteLinks.mjs`). It is that provider's most accurate model for
the job, as measured in `docs/link-eval.md`: for OpenAI gpt-6.1-sol, else
gpt-6-astra, else gpt-5.6-sol, whichever the key can use (asked once per app
session with `GET /v1/models/{model}`, no conversation text); for Anthropic
claude-opus-5-5. One request per summarized conversation carries the topic
names and the opening of the summary (at most 300 characters) of that
conversation and of at most 12 earlier ones, each under a letter: no title,
id, date, transcript or audio. An earlier conversation is sent only when the
same provider already wrote its summary: each summary records the route and
provider that wrote it (`notes.summary_route`, for example
`providers:openai`), and the check sends only conversations whose record names
the provider it uses. A conversation summarized on this computer, on the
person's own server, by another provider, or before the record was kept is
never sent; it keeps its links on this computer. Of the conversations that may
be sent, the check takes the ones most alike the new one on this computer;
when none is alike enough, nothing is sent. The sidebar counts the request
like any renderer request. With any other provider, a custom endpoint, a server
of the person's own or a model on this computer, there is no check.

The context check (off by default, Settings › Connections) uses the same
writing model by the same route, so it adds no destination either. When a
question gets a hedged answer or an "I don't know", the model gets one short
request: the question, the reply, and at most four passages from the team
folder or from past conversations (`src/helpers/contextCheck.mjs`). With a
model on this computer, nothing leaves. With a cloud provider selected, that
request goes to the provider. The team folder is read from disk and never
synced by Oats; its text reaches a model only as those passages
(`src/helpers/contextService.js`).

## The context check's agent (off by default)

When a reply is hedged or nobody knew, and the team's local context has no
answer, the context check can hand the question to an agent: the user's own
Claude Code, installed separately and signed in with the user's own account,
run headless in the background (`src/helpers/contextAgentRunner.js`). It is
off by default and runs only after the user turns it on in Settings.

- **Sent to Anthropic, by Claude Code:** the question and the reply, clipped
  to 500 and 800 characters, as the prompt of one Claude Code run. Never audio,
  never the rest of the transcript, never the summary. Claude Code uses the
  user's own account, model and settings for it.
- **Read through Claude Code:** the user's connected services, GitHub,
  Linear, Notion and Slack, through the plugins and MCP servers Claude Code
  already has. The search text the agent writes goes to those services. Oats
  stores no token for any of them.
- **Read only.** The run allows only read tools of those four services, by
  name, and refuses every other tool: no shell, no file writes, no web fetch,
  no other agents, no messages, and no tool of any other service, the user's
  mail and calendar included. The rules are in `src/helpers/contextAgent.mjs`;
  `test/helpers/contextAgent.test.js` runs the guard against a table of real
  tool names.

The app records each run in the on-device count, because no hook sees a
child process's requests: one request to Anthropic's API when Claude Code
starts, and one for each service the agent reads from. Claude Code makes more
requests than that (one per model turn, plus connecting the MCP servers it has
configured and whatever its own settings send), so the count shows that a run
happened and which services it reached, not each request. Claude Code's
auto-updater is off for the run.

## How the sidebar counts what leaves

The foot of the sidebar shows how many requests Oats sent to another computer
since it launched ("0 network requests since launch"). A number that misses a
path is worse than no number, so it is shown only because every path below is
either counted or zero by construction. `src/helpers/networkLedger.js` counts;
`test/helpers/networkLedger.test.js` and `test/helpers/networkBoundary.test.js`
pin the counting and the construction.

Not counted, because none of it reaches another computer: loopback (127.0.0.0/8,
`::1`, `localhost`: the local whisper, llama and Qdrant servers), unix sockets,
and schemes that are not network requests (`file://`, `devtools://`, `data:`,
`blob:`, `mailto:`). A LAN address is another computer and is counted.

| Path                                                                                              | What uses it                                                                    | How it is counted                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer requests: fetch, WebSockets, images                                                      | Provider calls made from the renderer                                           | `webRequest.onSendHeaders` on every session, attached as each session is created                                                                                                  |
| Main-process `net.request` and `net.fetch`                                                        | Model and helper downloads (`downloadUtils.js`), proxied transcription requests | The same hook. Measured on Electron 41: these pass through the session's webRequest, once per redirect hop, and before a connection that then fails                               |
| The updater, off unless `OATS_ENABLE_AUTO_UPDATES=true`                                           | Update checks                                                                   | The same hook, on the updater's own session                                                                                                                                       |
| Chromium downloads                                                                                | Nothing today                                                                   | `will-download`. `session.downloadURL` is pinned unused, because webRequest does not see it                                                                                       |
| Spellcheck dictionaries (Linux and Windows; macOS uses its own spellchecker)                      | Chromium, for a window with spellcheck on                                       | `spellcheck-dictionary-download-begin`                                                                                                                                            |
| Node `http` and `https` in the main process                                                       | Realtime transcription sockets (`ws`), Tinfoil, the AWS SDK                     | The `http.client.request.created` diagnostics channel                                                                                                                             |
| Node `fetch` in the main process                                                                  | AI SDK providers (Bedrock, Azure, Vertex), Tinfoil attestation                  | The `undici:request:create` diagnostics channel                                                                                                                                   |
| A link opened in the browser                                                                      | The question search, links in Settings                                          | `shell.openExternal` is wrapped; the Linux new-window launch records itself. One link is one request: the browser makes it, but Oats chose what it carries                        |
| Claude Code, run by the context check (off by default)                                            | Checking a question against GitHub, Linear, Notion and Slack                    | Recorded by `contextAgentRunner.js` itself: one for Anthropic's API when Claude Code starts, and one for each service it reads from                                               |
| Sidecars: whisper-server, llama-server, Qdrant, sherpa-onnx, ffmpeg, the echo-cancellation helper | Speech, writing, search, speakers                                               | Zero by construction: they listen on loopback and read local files. llama-server runs with `LLAMA_ARG_OFFLINE=1`, so its own downloader cannot run, and Qdrant's telemetry is off |
| The ONNX utility process                                                                          | Embeddings and speaker models                                                   | Zero by construction: it loads only `fs`, `os`, `path` and `onnxruntime-node`                                                                                                     |
| Raw sockets, HTTP/2, UDP, WebRTC                                                                  | Nothing                                                                         | Pinned unused, because none of the hooks above would see them                                                                                                                     |

Not counted separately: the DNS lookups, proxy auto-config fetches and
certificate checks that a counted request causes. The count lives in memory and
starts again at zero when Oats launches.

## Release verification

Before a release, capture a fresh-offline session and an online session with no
provider keys configured and auto-search disabled. Neither should create a
connection, except on a Mac that qualifies for Whisper Turbo: there the online
session downloads it once after setup, from `huggingface.co` only (cancel it,
or choose a speech model first, to check the rest). Then repeat with one
deliberate action at a time (model download, manual search, optional BYOK
request) and record only the expected destination above.

Then run the auto-search case explicitly: with it enabled, record a conversation
containing one answered and one unanswered question, and confirm the capture shows
**exactly one** search request, carrying only the unanswered question's text.

Useful host-level checks include `ss -tp` on Fedora and a per-process firewall or
network monitor on macOS. Keep the resulting capture and idle CPU/memory figures
with the release notes.
