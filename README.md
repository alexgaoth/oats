# Oats

Oats is a private, local-first intelligence tool for important in-person conversations. It records a conversation, then automatically turns it into a titled summary, transcript, and map of the threads that developed — while keeping audio, transcripts, summaries, and reasoning on the user's computer.

## Who it is for

Academics, hackers, and founders — people whose day is conversations, and whose edge is remembering, connecting, and acting on what was said. People discussing unannounced research, unshipped work, and unannounced fundraises, who are correspondingly allergic to cloud services and to setup friction.

The standard Oats holds itself to is a **pencil**: reliable and intuitive. A pencil has no battery, no account, no permission prompt, and no state that can be lost, and it works the ten-thousandth time exactly like the first — which is why people trust it with things that matter. Nobody was taught to use one, either; you pick it up and you already know. Oats is meant to be picked up the same way and trusted the same way, so that the tool disappears and the conversation does not.

The primary product deliberately has only three surfaces:

- **Conversation** — the default page and one deliberate action: record an in-person conversation around one microphone. A global shortcut (`Ctrl/Cmd+Shift+O` by default) starts and stops one from any application, without the window ever appearing.
- **Intelligence** — a high-signal list of conversations. Open one to read its summary, transcript, and threads.
- **Settings** — a small, fast page: choose local processing or one API key, then set the essentials (microphone, language, the dictation and conversation shortcuts, auto-search, and data). Everything else lives behind one **Advanced** entry.

Online recording, dictation, and legacy configuration remain in the codebase for compatibility, but are not part of the primary Oats information architecture.

## Catching every question

During a recorded conversation, Oats catches **every question asked in the room** — not only the ones nobody answers. A card appears the moment a question is spoken, with no waiting and no gap:

1. **The card appears instantly.** Question detection is local pattern recognition, so there is no round-trip and no downtime between asking and seeing the card.
2. **The card then resolves in place.** When Oats has judged whether the question was answered, the same card changes state rather than a second card appearing:
   - **Answered** — the card settles into an answered state and persists as part of the record.
   - **Nobody knew** — when someone is asked and actually says they don't know, Oats **opens the search in the browser automatically**, in the background, so the answer is already waiting. The card stays behind, marked as searched.
   - **Silence, or a hedge** — the card records that outcome and stops there. No browser opens. Nobody answering may just mean the room moved on, and "I think so?" may well contain the answer; neither is worth a tab. The search is one click away on the card.

Opening a tab mid-conversation is disruptive enough that it demands a **confirmed negative** — a question that was actually asked and actually met with "I don't know". Detection stays generous, because an extra card only costs a glance.

Only the question is quoted, not the turn it arrived in. People rarely speak in tidy single clauses, so a minute of context ending in "…do you know what the median seat price is?" shows just that question on the card and uses just that as the search query.

**How the verdict is reached.** The reply is read locally first — denial, hedge, backchannel, or a substantive answer are formulaic enough for pattern matching. The optional classifier model only refines that reading, and only when it is confident. This keeps outcomes working when the model is small, slow, or returns something off-contract: a card always resolves rather than sitting unjudged, and "no idea" is recognised as a denial without any model at all. The local patterns are currently English-only; in other languages an unrecognised reply resolves as uncertain, which shows the card but does not search.

Asking again is treated as signal, not noise. The same question asked twice produces two cards, and a rephrasing — “do you know…” then “are you aware of…” — produces its own card each time. Repeats nest under the first card rather than being suppressed, because re-asking is how people mark what actually matters.

Auto-search is the one thing that leaves the device during a conversation, it is stated plainly in the interface, and it can be turned off in Settings. Audio and transcripts never leave the device.

## During and after the conversation

Oats sits in a **field of oats** — a horizon, warm light gathering along it, and the earth below. That world is always there, so the app is a place rather than a blank page. Starting a conversation **grows the wheat out of it**, and stopping lets it withdraw. It is the warm answer to "you are being listened to", and it is a background rather than a subject: it never competes with a word on screen, it recedes on the reading surfaces, and `prefers-reduced-motion` freezes it to a still image.

If you stop and start again within half an hour, Oats **resumes the same conversation** rather than asking. Appending to the same note gives one transcript, one summary, and one set of threads instead of two halves to reconcile — and recording starts on the first press, because stopping to ask would cost the opening sentences, which are usually the ones worth catching. The screen simply says which conversation it is continuing.

While recording, an **open-thread stack** sits beside the listening indicator. It stays collapsed by default as a thin rail showing how many threads were started and never finished. One click expands it into a short list — a reminder of what the conversation should return to, with no checkboxes, tasks, or urgency — and it collapses again as soon as someone speaks.

Expanding it also shows **what else is worth raising**: threads the room opened and walked away from, topics that got a sentence and never developed, and subjects that in past conversations usually accompany whatever is being discussed now. These are computed locally from conversation data Oats already holds — no model call, no network — and they appear only inside the expanded stack, never as a prompt.

After recording stops, Oats automatically saves the final transcript and runs its intelligence pipeline, which generates the title, the summary, and a **Threads** section capturing the important lines of thought, how they developed, and what was left unresolved.

Opening a conversation in **Intelligence** shows that summary and transcript alongside a **topic graph** — an Obsidian-style force-directed map where nodes are topics sized by time spent, and edges are the transitions between them. It shows how the conversation actually moved, including the threads that were returned to. Selecting a node opens that topic's questions and lets the search be re-run.

Opening a conversation also shows what the **previous** conversation on the same subject left unfinished, and the conversation list can be searched across titles, summaries, and transcripts.

## The lifetime graph

Intelligence also has a **Map**, which zooms out: one node per conversation, an edge wherever two conversations covered the same subject, and a caption naming the subjects that keep coming back. The topic graph answers "how did this conversation move?"; the map answers the question you cannot see from inside any single conversation — "what do I keep coming back to?" Selecting a conversation shows what it covered and opens it.

## Small guarantees

Details that only matter when something goes wrong, which is exactly when they matter most:

- **Nothing is silently lost.** The transcript is written to the note as each utterance is finalised (debounced a couple of seconds), so a crash, a closed laptop, or an OOM kill costs at most the sentence in progress rather than the whole conversation. It used to be a blind 20-second timer, which could also lose the last thing said before a long pause.
- **A conversation that captured nothing is not saved.** Instead of leaving a blank note behind, Oats deletes it and says the microphone heard nothing.
- **A dead microphone is reported while it still matters.** If the input level stays at the noise floor for 30 seconds during a recording, Oats says so — rather than letting you discover it at the end.
- **What is missing is said before the conversation, not after it.** No microphone, no permission, no speech model, or a cloud key that was never saved — each is one line under the record button, checked again on the press. Only a missing microphone stops the press; the rest warn and let you record anyway.
- **A running conversation is visible without opening anything.** The floating oat comes back with a gold rim and a running clock for as long as one is being recorded, refuses to auto-hide, and finishes the conversation when clicked. The tray says the same thing and offers the same action.
- **Dismissing a question card can be undone** for six seconds.
- **Titles are editable.** Click the title in Intelligence to rename a conversation.
- **A conversation can be deleted**, from the conversation itself, with a second press to confirm.
- **The text leaves.** `copy` puts whatever you are reading — summary or transcript — on the clipboard; `save` writes it to a file.
- **Search lands on the sentence.** A conversation found by something said in it opens on its transcript, at the match, with every occurrence marked.
- **Searches open in their own browser window**, so a result never lands as a tab in some window on another workspace. Only the question text is sent, and any card can be searched by hand whether or not it was searched automatically.

## Principles

- **Audio stays local:** recordings, transcripts, summaries, question detection, and stored conversation data stay on the device. Processing runs locally by default, with an optional API key as the only alternative.
- **Reuse before rebuilding:** extend mature open-source software instead of creating another transcription and desktop stack.
- **Miss nothing:** every question is caught and recorded, instantly, whether or not it was answered. Coverage matters more than restraint here.
- **Help without interrupting:** cards are small, non-modal, never take focus, and never cover the person you are talking to. Searches open in the background.
- **Honest networking:** the only thing that leaves the device during a conversation is the text of a question somebody was asked and could not answer, sent to the configured search host. It is visible in the interface and switchable off. There is no silent cloud-model fallback and no telemetry.
- **Strong defaults:** do not make people choose a model for every feature. One processing choice powers transcription and intelligence.
- **Small surface, hidden depth:** the visible interface stays minimal; advanced configuration exists but lives behind a deliberate, non-default path.
- **Distinct Oats experience:** this is not an OpenWhispr reskin. Prefer sparse, deliberate, conversation-first UI over inherited feature breadth.
- **Reliable and intuitive, like a pencil:** it must work with no network, no model, and no account; it must never lose a conversation; and it must need nothing explained. A surface that requires a tooltip to be usable is the wrong surface.

## Foundation and credit

Oats is implemented as a narrow extension of [OpenWhispr](https://github.com/OpenWhispr/openwhispr), an MIT-licensed desktop application that already supports local dictation, meeting recording, transcription, summaries, local models, and macOS/Linux packaging. A single OpenWhispr-based implementation supports both Apple Silicon and Fedora GNOME/Wayland. Upstream provenance and remote setup are recorded in [UPSTREAM.md](./UPSTREAM.md).

[Muesli](https://github.com/Muesli-HQ/muesli) is a strong and lighter native reference for macOS, but its Apple-Silicon-only architecture would require a second implementation for Fedora.

## Project direction

The goal is for Oats to become straightforward for other people to install, understand, and use without needing to know the underlying transcription stack. It is intended to be open sourced.

The final project shape is deliberately undecided. Oats may become a focused contribution, optional feature, or add-on around OpenWhispr, or it may remain a more standalone application built on an upstream-tracking fork. That decision should follow real-world testing and discussion with the OpenWhispr maintainers rather than being forced early.

For now, correctness, privacy, and a usable end-to-end workflow matter more than reducing dependency size. Heavy inherited dependencies are not an immediate optimization target.

## Objectives

### Objective 1: Local conversation capture — delivered

- Local transcription of an in-person conversation around one microphone.
- Local conversation summaries and notes.
- Manual in-person recording without system-audio capture.
- Structured conversation events stored for later use.

Reliable identification of different people around one physical microphone is not required for the first version. Ordered utterances are sufficient for detecting question-and-response sequences.

### Objective 2: Conversation structure — delivered as a linear view

Persisted conversation events already record each detected question, its response outcome (answered, uncertain, silence, and so on), and any search with its interaction state. These currently render as a linear thread list, which remains the fallback view for short conversations.

### Objective 3: Catch every question — built, not yet tested live

Every question spoken produces a card immediately, repeats and rephrasings each produce their own card, and a question met with a confirmed “I don't know” opens a background search automatically. See [Catching every question](#catching-every-question).

### Objective 4: Live open-thread stack — built, not yet tested live

A collapsed-by-default rail during recording that tracks threads the conversation started and never closed, expandable on demand as a reminder.

### Objective 5: Topic graph in Intelligence — built, not yet tested live

An Obsidian-style force-directed map of topics and the transitions between them, replacing the linear list as the primary structure view for conversations with four or more topics.

### Objective 6: Topic suggestions — built, not yet tested live

Inside the expanded open-thread stack, a short list of what else is worth raising: unfinished threads, barely-touched topics, and subjects that historically accompany the live one. Local, no model call, never a prompt.

### Objective 7: The lifetime graph — built, not yet tested live

A cross-conversation map: nodes are conversations, edges are shared subjects, and a caption names what recurs. This reverses an earlier decision to keep cross-conversation graphs out of scope. Entity linking (people, companies, documents as first-class nodes) is still out of scope.

### Objective 8: Reliable dictation and recovery — built, partly tested live

Dictation paste verified against the selection it was actually written to, transcript checkpointing, empty-recording and dead-microphone reporting, undo, rename, and cross-conversation search.

### Future: iPhone

An iPhone companion is a goal beyond the desktop release, not a port. The desktop application is Electron with local whisper.cpp, a Qdrant sidecar, and SQLite, none of which run on iOS, so iPhone means a second implementation — most likely a thin capture-and-review client that records a conversation and hands processing to a paired Mac, rather than a full on-device stack. The decision is deliberately deferred until macOS and Fedora are shipped and used in the real world.

## Status

### Local processing is the default — fixed (2026-07-30)

The principle above ("processing runs locally by default") was true in this
document and false in the code. Recording a conversation resolves its
transcription through `selectResolvedMeetingTranscription`, which reads
`meetingUseLocalWhisper` — and that defaulted to `false` while its sibling
`meetingTranscriptionMode` defaulted to `"local"`. The two meeting settings
contradicted each other out of the box, so on a fresh install pressing record
failed with _"OpenAI realtime requires a bring-your-own-key API key"_ on a
machine that ships with a Whisper model and promises to work offline.

Settings hid it rather than showing it: the visible processing choice wrote the
_dictation_ scope only, so "On this computer" could be selected and lit gold
while the primary action still reached for the cloud.

Both halves are fixed — transcription defaults to local in all three scopes, and
the one visible choice now configures the meeting scope too, so one choice means
one pipeline. Existing installs keep whatever they had stored; only new ones see
the new defaults. Pinned by `test/helpers/meetingTranscriptionDefaults.test.js`.

### Current product reset (2026-07-28)

The control panel now renders the minimal Oats workspace in `src/components/OatsWorkspace.tsx` rather than the inherited multi-view shell:

- **Conversation** creates a `meeting` note and starts microphone-only (`in_room`) recording.
- **Intelligence** shows completed meeting notes with **Summary**, **Transcript**, and **Threads** views.
- **Settings** exposes a unified local-versus-API processing choice, one API-key field, and conversation language.

The automatic post-recording intelligence trigger now lives in the new Conversation surface, so it does not depend on opening the legacy Notes UI. Legacy components remain available internally while data/configuration migration and further deletion continue.

All five objectives are implemented and pass the local verification suite (setup check, unit tests, formatting, lint, TypeScript, and the production renderer build). The default Whisper `base` model is bundled into release builds and installed locally on first run, so a fresh offline install needs only the operating-system permissions.

Objectives 3 to 5 are **built but not yet exercised against real speech**. Their pure logic is unit-tested, but question detection, the topic-shift thresholds behind the stack and graph, and design conformance in both colour modes all need a human with a microphone. Outstanding work is tracked in [TODO.md](./TODO.md).

Remaining verification, which requires packaging and hardware rather than further code:

- Install and smoke-test the Fedora 44 RPM on GNOME/Wayland. The RPM itself now builds: `dist/Oats-1.7.6-linux-x86_64.rpm`, with the bundled Whisper model present.
- Build and smoke-test a notarized DMG on Apple Silicon.
- Measure idle and active CPU/memory to confirm question detection stays cheap when idle.
- Capture the release network trace described in [the allowlist](./docs/network-allowlist.md), including the auto-search case.

The following are intentionally **not** built: persistent voice identity or in-room speaker recognition, ambient always-on listening outside explicit recordings, search-result scraping or answer generation, online meeting recording as a primary surface, and entity linking (people, companies, and documents as first-class graph nodes). Automatic searches are in scope, but only for a question met with a confirmed "I don't know", and only for the question text.

## Developer setup

Oats currently requires Node.js 24. The setup check itself has no third-party dependencies, so run it first even on a restricted network:

```sh
nvm use 24
npm run setup:check
```

If dependencies are not installed yet, the check prints what is missing and the next command. When registry and download access are available:

```sh
npm ci
npm run setup:check
npm run dev
```

Local Whisper also requires a platform-specific `whisper-server` helper. It is deliberately an explicit setup step so a constrained network does not prevent the rest of the application from starting:

```sh
npm run setup:local-whisper
```

This downloads the helper for the current supported platform. Development speech models are selected and downloaded separately in the application. Release builds bundle Whisper `base`, so installed Oats works offline on first run. On a constrained network it is safe to stop and retry later; the source checkout does not need to be recreated.

### Linux: dictation paste prerequisites

Dictation types into whatever app you are focused on, which needs two things the
package manager provides:

```sh
# Fedora — native paste helper (X11 headers), plus the Wayland clipboard tools
sudo dnf install libX11-devel libXtst-devel wl-clipboard
npm run compile:linux-paste
```

Without `linux-fast-paste` compiled, Oats falls back to `xdotool`/`ydotool` and,
failing those, the RemoteDesktop portal — which shows a screen-sharing consent
dialog. Screen sharing is never _required_; it is only the last resort when no
input-injection route is available.

Keystroke injection on Wayland uses `/dev/uinput`. Most desktops grant the
logged-in user access via an ACL; if paste silently does nothing, check with
`getfacl /dev/uinput` that your user has `rw`.

A healthy setup report ends with:

```text
Ready for development.
Next: npm run dev
Feature tests: npm run test:oats
```

If the helper is missing, the same report instead names its expected path and prints `npm run setup:local-whisper` as the recovery command.

### Manual question-card test

1. Start the application with `npm run dev`.
2. Configure a local transcription model, such as Whisper `base`.
3. Download a local classifier model and confirm question detection is enabled.
4. Start a conversation from the **Conversation** surface.
5. Say “Do you know what Kubernetes is?”, pause, then say “No.”
   - Confirm a card appears as soon as the question is spoken, before the answer.
   - Confirm the same card then resolves to unanswered and a Google search opens in the background without stealing focus.
6. Say “What year was Postgres released?”, pause, then answer it correctly.
   - Confirm a card appears immediately and resolves to answered, that it persists, and that **no** browser opens.
7. Ask the same question twice, then ask it again as “are you aware of…”.
   - Confirm each asking produces its own card, nested under the first, with none suppressed.
8. Toggle auto-search off in Settings and repeat step 5. Confirm the card still appears and resolves but no browser opens.
9. Expand the open-thread stack mid-conversation, confirm it lists unfinished threads, then speak and confirm it auto-collapses.
10. Stop recording, open the conversation in **Intelligence**, and confirm the topic graph renders with the questions reachable from their topic nodes and re-search working.
11. Choose **Map** in Intelligence and confirm the lifetime graph connects conversations that shared a subject, and that the caption names the recurring ones.
12. Ramble for a while and put the question at the very end. Confirm the card quotes only the question, not the whole turn.
13. Stop, then start again within half an hour, and confirm Oats offers to continue the previous conversation.
14. Stop a recording that captured nothing and confirm no blank note is left behind.

### Sample data

To look at the graphs without recording anything:

```sh
npm run seed:sample           # three linked conversations
npm run seed:sample -- --remove
```

The seed runs the real topic tracker rather than writing fixture data, so what you see is what the detector actually produces.

### Automated checks

Run the Oats-specific checks while iterating:

```sh
npm run test:oats
```

Run the complete local verification before sharing a change:

```sh
npm run verify:all
```

`verify:oats` checks setup, Oats behavior, formatting, lint, TypeScript, and the production renderer build. `verify:all` also runs the complete inherited suite under Electron's matching native-module ABI. Some upstream tests use loopback sockets, native binaries, or platform-specific facilities and may require normal host permissions.

## Privacy Boundary

Recorded audio, transcripts, summaries, and stored conversation data never leave the device. Question detection and intelligence run locally unless the user supplies an API key.

Two things do cross the network, and both are stated in the interface rather than buried here:

- **Model downloads**, for speech and reasoning models the user explicitly selects.
- **Question searches.** When a question is met with a confirmed “I don't know”, Oats opens an encoded HTTPS search URL in the browser. Only the question text is sent, never audio or transcript context, and Oats does not fetch or scrape the results. This is on by default because a question nobody could answer is exactly when help is worth having, and it is a single toggle in Settings to turn off. Searches can also be re-run manually from the topic graph.

The full picture is in [the network allowlist](./docs/network-allowlist.md).
