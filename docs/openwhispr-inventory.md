# The OpenWhispr seam — every renderer surface, classified

Oats is a fork. The question this answers is which parts of the renderer are the
product, which are the inherited application kept deliberately, and which were
neither — reachable by nothing, shipped by inertia.

Classification is by **import reachability**, computed over the whole
repository's graph (renderer entry points, the Electron main process, `scripts/`
and `test/`), not by reading or by grepping for names. A file is live if some
live file imports it; the roots are `main.js`, `preload.js`, `cleanup.js`,
`src/main.jsx`, `src/AppRouter.jsx`, every test and every script.
`scripts/`-generated and path-loaded files are the two exceptions and are named
below.

Regenerate the numbers by walking the graph again; they were last computed on
2026-08-22, after the deletion described at the end.

## The six renderer entry points

`AppRouter.jsx` dispatches on the query string. There is no router library and
no route table — this list is the whole of it.

| entry                             | query                         | what it is                                                                     |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `OatsWorkspace.tsx`               | `?panel=true`                 | **Oats primary.** The three surfaces: Conversation, Intelligence, Settings.    |
| `OnboardingFlow.tsx`              | `?panel=true`, first run      | **Oats primary.** One step: microphone permission.                             |
| `App.jsx`                         | _(none)_                      | **Oats primary.** The floating oat — the only thing that says Oats is running. |
| `AgentOverlay.tsx`                | `?agent=true`                 | **Compatibility.** The inherited voice-agent chat panel.                       |
| `MeetingNotificationOverlay.tsx`  | `?meeting-notification=true`  | **Oats primary.** "A meeting started — record it?"                             |
| `UpdateNotificationOverlay.tsx`   | `?update-notification=true`   | **Compatibility.** Inherited updater UI.                                       |
| `TranscriptionPreviewOverlay.tsx` | `?transcription-preview=true` | **Compatibility.** Dictation preview.                                          |

## Oats primary — 16 components, 5,332 lines

The product. `OatsWorkspace.tsx` (2,256) holds all three surfaces; the rest is
the signature work: `conversation/` (contour, signal rail, listening pulse, open
thread stack, `useContour`), and the graph stack `notes/ForceGraph`,
`graphPhysics`, `ConversationGraph`, `TopicGraph`, `LifetimeGraph`.
`MeetingRecordingMount`, `PermissionsSection`, `MarkdownRenderer`,
`PostMigrationOnboarding` and `BackgroundActionToastListener` complete it.

The `notes/` directory name is a leftover: what is left in it is the topic and
lifetime graphs, which are Oats signature surfaces (`DESIGN.md` §9.5–9.6).
Renaming it is cosmetic and has not been done.

## Advanced Settings — 46 components, 11,242 lines

Reachable from `SettingsPage.tsx`, which is the **inherited application**, kept
deliberately behind one non-default path and deliberately _not_ carrying
`.oats-surface`, so it keeps looking like itself. Twice the size of the product
it sits behind.

The bulk: `SettingsPage` (3,013), `TranscriptionModelPicker` (1,111),
`HotkeyInput` (723), `ReasoningModelSelector` (703), `PromptStudio` (523),
`OpenAICompatiblePanel` (395), plus the provider/model machinery
(`ModelCardList`, `SearchableModelList`, `ProviderTabs`, `ProviderIcon`,
`ApiKeyInput`, `GetApiKeyLink`, `SelfHostedPanel`, `InferenceConfigEditor`).

This count includes shared `ui/` primitives that the Oats surfaces also use —
`button`, `toggle`, `input`, `select`, `dialog`, `popover`, `lib/utils`. They are
in the subtree because `SettingsPage` reaches them, not because they are
Advanced-only.

**Still to decide:** the enterprise and BYOK provider configuration is the
largest single block of inherited surface area, and the product direction allows
exactly one API key. Isolating it further, or deleting the enterprise cloud
credentials path, is a product decision that has not been made.

## Agent overlay — 12 components, 1,318 lines

Compatibility. The inherited chat agent: `AgentOverlay`, `agent/*`, `chat/*`
(`ChatMessage`, `ChatInput`, `ChatMessages`, `useChatStreaming`,
`useChatPersistence`). Not one of the three surfaces, reachable only by its own
window, and untouched by the art-direction reset.

## Deleted — 67 files, 10,471 lines

The OpenWhispr notes application, which nothing had been able to reach since the
three-surface architecture landed. It was not behind a flag or a route; no code
path led to it.

The largest: `PersonalNotesView` (1,328), `notes/NoteEditor` (1,051),
`MeetingTranscriptChat` (885), `NotesOnboarding` (375), `ActionManagerDialog`
(339), `TranscriptionItem` (324), `SnippetsView` (322), `chat/ConversationList`
(310), `NoteListItem`, `NoteParticipants`, `NoteBottomBar`, `EmbeddedChat`,
`SidebarModal`, `LocalWhisperPicker`, and the folder/action/drag machinery
behind them (`useFolderManagement`, `useNoteDragAndDrop`, `useActionProcessing`,
`useNotesOnboarding`, `useEmbeddedChat`, `chatStore`, `transcriptionStore`,
`fileTranscription`). With them went nine orphaned `ui/` primitives —
`dropdown-menu`, `tooltip`, `card`, `tabs`, `accordion`, `progress`, `label`,
`skeleton`, `RichTextEditor` — and five npm dependencies:
`@radix-ui/react-{accordion,dropdown-menu,label,progress,tabs}`.

**The bundle barely moved: 4,176,411 → 4,121,110 bytes.** Unreachable code was
already being tree-shaken, so this was weight in the repository, not in the
build — 10,471 lines that every future reader, grep and refactor had to wade
through, and that an agent looking for "the note editor" would find and edit.

Two files the graph reports as unreachable are **kept**, because they are loaded
by path rather than imported:

- `src/workers/onnxWorker.js` — spawned by `helpers/onnxWorkerClient.js` and
  packaged by `scripts/afterPack.js`.
- `src/vite-env.d.ts` — an ambient type declaration.

Verified after deletion: `npm run verify:oats` exit 0, `npm run i18n:check`
consistent, and all three surfaces render at 1200x800 and 1200x680 in the built
renderer with nothing unreachable.

## Not done

- **Orphaned locale keys.** Deleting the notes application orphaned its strings
  in all ten locale files. `i18n:check` compares key sets _between_ locales, so
  it cannot see keys that are consistently unused, and a scripted sweep across
  locale files is the operation `CLAUDE.md` warns about most. It wants its own
  pass with per-key evidence.
- **`notes/` should be `graph/`.** Cosmetic.
- **The enterprise/BYOK provider block.** A product decision, above.
