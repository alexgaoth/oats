# Developing Oats

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

## Linux: dictation paste prerequisites

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

## Manual question-card test

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
11. Choose **Global** in Conversations and confirm the force graph and the arc timeline connect conversations that shared a subject, that the line above the timeline names the ones that come back, and that pointing at a conversation lights it in both.
12. Ramble for a while and put the question at the very end. Confirm the card quotes only the question, not the whole turn.
13. Stop, then start again within half an hour, and confirm Oats offers to continue the previous conversation.
14. Stop a recording that captured nothing and confirm no blank note is left behind.

## Sample data

To look at the graphs without recording anything:

```sh
npm run seed:sample           # three linked conversations
npm run seed:sample -- --remove
```

The seed runs the real topic tracker rather than writing fixture data, so what you see is what the detector actually produces.

## Automated checks

Run the Oats-specific checks while iterating:

```sh
npm run test:oats
```

Run the complete local verification before sharing a change:

```sh
npm run verify:all
```

`verify:oats` checks setup, Oats behavior, formatting, lint, TypeScript, and the production renderer build. `verify:all` also runs the complete inherited suite under Electron's matching native-module ABI. Some upstream tests use loopback sockets, native binaries, or platform-specific facilities and may require normal host permissions.
