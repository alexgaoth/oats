# Oats

Oats is a private, local-first conversation aide for dictation, meeting notes, and timely research prompts. It is intended to feel like Granola or Muesli while keeping audio, transcripts, summaries, and reasoning on the user's computer.

The first version focuses on two everyday modes:

- Dictation into any application.
- Recorded conversations, including online meetings and in-person discussions around one microphone.

During a recorded conversation, Oats watches finalized transcript utterances for unanswered factual questions. For example:

> “Do you know what Kubernetes is?”
>
> “No.”

Oats then displays a small, dismissible card offering to search Google for the question. It never opens a browser or sends the query to Google automatically; the query leaves the device only when the user clicks the card.

After a conversation, the note's **Graph** view lays out every detected question alongside its response outcome and any search suggestion, so the structure of the discussion can be reviewed and any question re-searched on demand.

## Principles

- **Local by default:** audio, transcripts, summaries, question detection, and stored conversation data stay on the device.
- **Reuse before rebuilding:** extend mature open-source software instead of creating another transcription and desktop stack.
- **Quiet assistance:** intervene only for likely unanswered factual questions, with cooldowns and easy dismissal.
- **User-controlled networking:** no background search requests and no silent cloud-model fallback.
- **Lightweight evolution:** persist structured conversation events and surface them through the conversation graph view, growing capability without over-building.

## Foundation and credit

Oats is implemented as a narrow extension of [OpenWhispr](https://github.com/OpenWhispr/openwhispr), an MIT-licensed desktop application that already supports local dictation, meeting recording, transcription, summaries, local models, and macOS/Linux packaging. A single OpenWhispr-based implementation supports both Apple Silicon and Fedora GNOME/Wayland. Upstream provenance and remote setup are recorded in [UPSTREAM.md](./UPSTREAM.md).

[Muesli](https://github.com/Muesli-HQ/muesli) is a strong and lighter native reference for macOS, but its Apple-Silicon-only architecture would require a second implementation for Fedora.

## Project direction

The goal is for Oats to become straightforward for other people to install, understand, and use without needing to know the underlying transcription stack. It is intended to be open sourced.

The final project shape is deliberately undecided. Oats may become a focused contribution, optional feature, or add-on around OpenWhispr, or it may remain a more standalone application built on an upstream-tracking fork. That decision should follow real-world testing and discussion with the OpenWhispr maintainers rather than being forced early.

For now, correctness, privacy, and a usable end-to-end workflow matter more than reducing dependency size. Heavy inherited dependencies are not an immediate optimization target.

## Objectives

### Objective 1: Local conversation aide — delivered

- Local dictation and transcription.
- Local conversation summaries and notes.
- Manual in-person recording without system-audio capture.
- Online meeting recording with microphone and system audio.
- Detection of unanswered factual questions.
- A local overlay offering a user-initiated Google search.
- Structured conversation events stored for later use.

Reliable identification of different people around one physical microphone is not required for the first version. Ordered utterances are sufficient for detecting question-and-response sequences.

### Objective 2: Conversation structure UI — delivered

A **Graph** view on each recorded note reads the persisted conversation events and lays out the discussion's structure: each detected question, its response outcome (answered, uncertain, silence, and so on), and any search suggestion with its interaction state (shown, opened, dismissed, expired). Suggestions can be re-searched from the graph through the same host-validated, HTTPS-only, click-to-search boundary as the live card. Cross-meeting topic graphs and entity linking remain out of scope.

## Status

Both objectives are implemented and pass the local verification suite (setup check, unit tests, formatting, lint, TypeScript, and the production renderer build). The default Whisper `base` model is bundled into release builds and installed locally on first run, so a fresh offline install needs only the operating-system permissions.

Remaining verification, which requires packaging and hardware rather than further code:

- Build and smoke-test an RPM on Fedora 44 GNOME/Wayland.
- Build and smoke-test a notarized DMG on Apple Silicon.
- Measure idle and active CPU/memory to confirm question detection stays cheap when idle.
- Capture the release network trace described in [the allowlist](./docs/network-allowlist.md).

The following are intentionally **not** built: persistent voice identity or in-room speaker recognition, ambient always-on listening outside explicit recordings, automatic or background searches, search-result scraping or answer generation, and cross-meeting entity/topic graphs.

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

A healthy setup report ends with:

```text
Ready for development.
Next: npm run dev
Feature tests: npm run test:oats
```

If the helper is missing, the same report instead names its expected path and prints `npm run setup:local-whisper` as the recovery command.

### Manual conversation-aide test

1. Start the application with `npm run dev`.
2. Configure a local meeting transcription model, such as Whisper `base`.
3. In the Conversation aide settings, download a local classifier model and enable the aide.
4. Open a note and choose the people icon for a microphone-only in-person conversation.
5. Say “Do you know what Kubernetes is?”, pause, then say “No.”
6. Confirm that one search card appears. Dismiss it and confirm that no browser opens; repeat and click the card to confirm that an encoded search opens.
7. Open the note's **Graph** view and confirm the question, its response outcome, and the search suggestion appear, and that re-searching from the graph opens the same encoded query.

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

Oats may download explicitly selected speech and reasoning models. While running, recorded audio and derived data remain local. The only search-related network action in the first version is opening an encoded Google Search URL after an explicit click.
