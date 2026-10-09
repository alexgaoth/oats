# Oats Technical Reference for AI Assistants

## Active product direction (2026-07-28)

The current UI is still far too visually similar to OpenWhispr. This is a product-level concern, not polish debt. Future UI work must move decisively toward a distinct Oats visual language and information architecture; do not preserve or merely reskin inherited OpenWhispr layouts, component patterns, or product feel.

The intended product has exactly three primary surfaces:

1. **Conversation** — the default: record an in-person conversation with one deliberate action. Carries the listening pulse and the conversation contour always; the live question cards, the detected dialogue and the collapsed open-thread stack only in the **Detailed** composition (`DESIGN.md` §9.0). **Clean is the default**, and it holds a stricter rule than "fewer elements": no text that changes while somebody is speaking. Online recording is not part of the primary UI.
2. **Intelligence** — a high-signal list of important conversations. Opening one shows its titled summary, transcript, and an Obsidian-style force-directed **topic graph** of how the conversation moved (linear thread list as the fallback under four topics). A `Map` link switches to the **lifetime graph**: nodes are conversations, edges are shared subjects. Cross-conversation graphs are now in scope; entity linking is not.
3. **Settings** — a fast, simple page. Present one processing choice (local Oats models or one API key) plus only essential microphone, language, privacy, shortcut, and auto-search controls. Do not expose separate model/provider configuration for each feature; everything else lives behind one non-default **Advanced** path.

The product is aimed at **academics, hackers, and founders** — high-signal, intellectually intensive users, in their daily conversations. Favor calm, sparse information architecture, strong defaults, and a small number of deliberate choices over feature breadth or configuration flexibility.

The standard is a **pencil: reliable and intuitive.** Reliable means it works with no network, no model, and no account, never loses a conversation, and fails loudly at the start rather than quietly at the end. Intuitive means nothing needs explaining — no tours, no tips, no modes to be in, nothing to remember between uses. The `oats-design` skill (`.claude/skills/oats-design/`) turns this into checkable rules and lists the review-blocking defects; load it for any UI, UX, motion, or copy work.

After an in-person recording stops, Oats automatically generates the conversation title, summary, and threads. This is a core default, not a user-initiated "generate intelligence" step.

### Question handling — five rules that override older code and comments

The `conversationAide` implementation still reflects a narrower earlier design. When touching it, these win:

1. **Every question gets a card, instantly.** Not only unanswered ones, and with no wait for an answer. Detection is local pattern matching (no model round-trip); the classifier verdict updates the _same_ card in place rather than creating a second one.
2. **A confirmed negative → the search opens automatically**, in the background, without stealing focus. “Confirmed negative” means `denied_knowledge` above the confidence threshold — somebody was asked and said they did not know. Silence, hedges, low-confidence denials, and answers all just record their outcome on the card; nothing opens. One Settings toggle, default on.
3. **Repeats and rephrasings are never suppressed.** `suggested`, `cooldownMs`, and `candidateDedupeMs` were removed for this reason. Each asking gets its own card, nested visually under the first. Density is a rendering problem, never a reason to drop a detection.
4. **The reply is read locally first; the model only refines it.** `assessResponseLocally()` classifies denial / hedge / backchannel / substantive answer by pattern, and that is the _primary_ verdict. The classifier may override it only when confident, and a failed or malformed classifier resolves the card locally rather than stranding it at `asked`. Do not reintroduce a design where a card's outcome depends on the model succeeding — the default classifier is a 1.5B local model and it frequently does not. The patterns cover all ten shipped locales (since 2026-08-07); an unrecognised language still degrades to `uncertain`, which shows the card but does not search.
5. **Only the question is quoted.** `extractQuestionSentence()` pulls the interrogative sentence out of a longer turn before it reaches the card, the event, or the search query.

Because of rule 2, **never write "nothing leaves your device"** in UI copy, docs, or comments. The accurate claim: audio and transcripts stay on the device; the text of questions nobody could answer is sent to the configured search host. See `docs/network-allowlist.md`.

**Where the card pipeline lives** (tracing this cold costs an hour): the aide session runs in the _renderer_, created by `startConversationAide` in `meetingRecordingStore.ts` — gated there on `conversationAideEnabled` (localStorage, default **true** since 2026-08-07; a closed gate logs to the debug logger and surfaces as the `question-cards-off` preflight line under the record button). The detection and verdict patterns cover all ten shipped locales — JS `\b` is ASCII-only, so the non-English patterns use explicit boundary classes (spaced scripts) or none (CJK); see the comment block in `conversationAide.mjs` before touching them, and change verdict patterns only with both-direction test pins (a false `denied` auto-opens a browser; `test/helpers/conversationAide.test.js` pins ~250 assertions from a 3-round critic loop, including deliberately-declined patterns — do not re-add unaccented es "no se" or whitespace-terminated CJK question endings without new evidence). Finalized segments arrive at pauses in a room (`speechSegmenter.mjs`, ≤20s) and every ~5s on a local call (`LOCAL_MEETING_CHUNK_INTERVAL_MS`, `ipcHandlers.js`); cards are published into `useMeetingRecordingStore.questionCards` and drawn by `conversation/ConversationSignalRail`, **docked in the Conversation surface** under the contour — but only in the Detailed composition. In Clean the rail is still mounted with `announceOnly`, drawing nothing and announcing normally, because assistive output is identical in both and a "calmer" composition that told a screen-reader user less would be a smaller product for them, not a quieter one. Until 2026-08-20 they crossed an IPC boundary into a separate always-on-top overlay window; that window, its route, its five IPC channels and its `conversation-assist-ready` handshake are all deleted. The handshake's _lesson_ still stands and is used elsewhere: an event fired right after a surface is created dies before any listener exists, so cold-start hand-offs need push-plus-pull (`consume-pending-focus-search` for the recall hotkey, `consumePendingNote` for opening a conversation from the Conversation surface).

`DESIGN.md` (v2, 2026-10-09) is the binding visual spec: the standard shadcn/ui new-york system on neutral zinc, Inter, and a sidebar frame (`shell/AppSidebar.tsx`), so Oats looks and behaves like the desktop tools a team already uses. The v1 "private conversation ledger" (paper, graphite, gold, mono, dithering) was retired at Alex's direction; it is in git history. The conversation contour and graphs stay — every value in them is measured from the conversation — drawn in neutral tones.

### Linux input and clipboard — hard-won facts

Re-deriving these costs hours, so they are recorded here:

- The app **self-relaunches under XWayland** (`main.js` top of file, `--ozone-platform=x11`). So `clipboard.writeText` owns the **X11** selection while native Wayland apps read the **Wayland** one. Verify a clipboard write against the selection it was written to — `clipboard.readText()`, not `wl-paste` — and write **both** selections, since the paste target may read either.
- `wl-copy` **never exits**: a Wayland clipboard offer is served by a live process. Spawn it detached with no inherited pipes, never under `spawnSync`, and keep exactly one alive (`_ownWaylandClipboard`).
- `wl-paste` has been observed **hanging indefinitely**, even on `--list-types`. It sits on the paste hot path and must be behind a circuit breaker.
- A freshly created `uinput` device is **not usable for ~200ms+** — udev, then libinput, then the compositor. Writes before that succeed at the kernel and are silently dropped, so the paste tool exits 0 while nothing was typed. `resources/linux-fast-paste.c` waits 300ms.
- **`setIgnoreMouseEvents(true, { forward: true })` does not forward on Linux.** `forward` is macOS and Windows only; on Linux Electron replaces the window's X11 _input shape_ with a 1×1 rectangle, so a click-through window receives **no** mouse events — including the `mouseenter` that would turn it back on. Any design where the renderer's own hover decides its click-through state deadlocks on the first `mouseleave`. The floating oat's state is therefore decided in the main process from three inputs (renderer hold, real cursor position, drag in progress) — `oatInteractivity.js`, applied by `windowManager`, with a 250ms cursor poll while the oat is on screen as the only way back.
- **The floating oat cannot be focused, so it fires no focus events at all.** All three overlay windows are `focusable: false` (`windowConfig.js`); measured, `document.hasFocus()` is `false` and a `focusin` listener counts zero events while `activeElement` moves under `.focus()`. Every `onFocus`/`onBlur` on that window is dead code, and any control mounted only on hover is pointer-only by construction — the escape that works without a pointer is the cancel hotkey, which `useAudioRecording.js` registers on start and unregisters the moment transcription begins.
- **Fn cannot be a hotkey on Linux.** Most keyboards handle it in firmware and never emit `KEY_FN`, and `hotkeyManager.js` rejects `Fn`/`GLOBE` outside macOS. Right-side modifiers (`RightAlt` and friends) are the working single-key equivalent.

### macOS development — hard-won facts (2026-10-08)

The first Mac run of this repo (macOS 26.6, Apple M5 Pro). Re-deriving these
costs hours:

- **The Swift helpers need an SDK the compiler can read.** Command Line Tools
  can ship a newer SDK than its own Swift: on this machine the default
  `MacOSX.sdk` was 27.0, built with Swift 6.4, against a 6.3.3 compiler, and
  every `compile:*` Swift step failed with "this SDK is not supported by the
  compiler". Pin an older SDK for the session:
  `export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`
  (`ls /Library/Developer/CommandLineTools/SDKs/` lists what exists).
- **Chromium's fake microphone cannot read its file under the macOS audio
  sandbox.** `--use-file-for-fake-audio-capture` logs "Failed to read … as input
  to the fake device. Try disabling the sandbox" and delivers nothing — no
  frames at all, so the in-room WAV stays at its 44-byte header and the screen
  says "Nothing heard yet." Add `--disable-features=AudioServiceSandbox` (test
  runs only). The Linux recipe below does not need it.
- **Quit through the main process, not the renderer.** `--inspect=PORT` exposes
  main; evaluate `process.mainModule.require("electron").app.quit()` there to
  take the same `before-quit` path ⌘Q takes. A port held by a previous instance
  makes Electron log "Starting inspector … failed: address already in use" and
  run without one — use a fresh port per launch.
- **macOS has no `timeout`.** `perl -e 'alarm shift; exec @ARGV' 300 <cmd>` is
  the stock substitute.
- **Downloads through a proxy:** Hugging Face transfers through this machine's
  proxy broke HTTP/2 framing mid-file; `curl --http1.1 -C -` resumes cleanly.
  `scripts/download-minilm.js` finished its files and then never exited (a
  keep-alive socket held the event loop) — check the files, not the process.
- **Voices for a test conversation:** `say -v Samantha -o a.aiff "…"` and
  `afconvert -f WAVE -d LEI16@16000 -c 1 a.aiff a.wav` give a 16 kHz mono turn;
  concatenate turns with ~1.6 s of low noise between them so the segmenter
  learns a room floor and cuts at the pauses.
- **The Metal "error compiling source" line is benign.** whisper-server probes
  Metal 4's tensor API, logs that it failed, disables it ("has tensor = false")
  and runs on the embedded Metal library. Transcription is on the GPU.

### Running a second Oats to check a claim (2026-08-19)

`OATS_CHANNEL=staging npx electron . --remote-debugging-port=PORT --ozone-platform=x11`
drives the real app without disturbing one the user has open. Three traps:
`OATS_CHANNEL` is what isolates userData, **not** `--user-data-dir` (`main.js`
calls `app.setPath` and overrides it) — and a value outside `VALID_CHANNELS`
silently falls back to `development`, so a typo'd channel writes into the
developer's own profile and proves nothing about a fresh one; pass `--ozone-platform=x11` yourself or
the XWayland re-exec loses the race to rebind the debug port and Chromium
disables remote debugging silently; and a killed instance can leave a `pactl
subscribe` child holding the inherited listening socket, so the port accepts TCP
and never answers (`ss -ltnp` names the holder). `npm run perf:baseline` does all
of this — procedure and numbers in `docs/performance-baseline.md`.

**Recording can be driven end to end with no microphone (2026-10-08).** Add
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
--use-file-for-fake-audio-capture=/ABSOLUTE/conv.wav%noloop` (a relative path is
silently unreadable) and press Record over CDP. Four traps: `electron .` loads
`src/dist`, so `npm run build:renderer` first or you test the old renderer;
wait for `document.readyState === "complete"` before any `Page.reload`, or
`loadFile` aborts and main logs "Failed to start app" and never recovers;
spawn it `detached` and kill the process group, or a surviving instance holds
the staging single-instance lock and the next launch exits silently; and Oats
resumes a conversation that ended moments ago, so back-to-back runs append to
one note.

**A renderer change can be checked with no harness file at all (2026-10-03).**
Run the real `cd src && npx vite --port P` and a headless Chrome with
`--remote-debugging-port`; inject `window.electronAPI` with
`Page.addScriptToEvaluateOnNewDocument` as a Proxy (real data for `getNotes` and
`listConversationEvents`, a callable thenable for everything else) and load
`/?panel=true` — or `/` at 96×96 for the floating oat. Fixture conversations can
be real tracker output: `helpers/conversationTopics.mjs` runs under plain node.
Two traps. Seed live state by importing a store **from the URL the app loaded**
(`performance.getEntriesByType("resource")`): once a file has been edited, Vite
serves the app's copy as `…?t=…`, and the bare path creates a second store that
nothing renders. And park the page on `about:blank` between runs, or an edit is
hot-swapped into it and throws `removeChild` into the next run's log.

**A screenshot harness must not live under `src/`.** `format:check` does
`cd src && eslint . && prettier --check "**/*.{js,jsx,ts,tsx,json,css,md}"`, so
its prettier glob covers `src/` and nothing else — but that is exactly where a
renderer harness wants to sit, and a harness is the file nobody thinks to
format, so one makes `verify:oats` exit 1 for everyone. Keep it outside the
repo, or delete it in the same turn that used it. (Markdown outside `src/` is
therefore _not_ gated: `.claude/`, `agent-skills/`, `UI_OVERHAUL.md` and
`docs/deletion-checklist.md` are all currently unformatted and CI is green.)

### The Oats/OpenWhispr style boundary is `.oats-surface` (2026-08-19)

Inherited `input`/`textarea`, `.card` and `h1..h6` rules in `index.css` are
**unlayered**, and unlayered CSS beats everything in `@layer utilities`
regardless of specificity — so `text-2xl font-normal` on a heading did nothing
and every Oats heading rendered at the inherited 40px/700 for months, while
`DESIGN.md` §5's type scale never shipped at all. Check a suspect property with
`getComputedStyle` before believing a utility class; a Tailwind class in the
markup is not evidence that it won. All four rule sets are scoped **out of any
`.oats-surface` subtree**, and so is a fifth found on 2026-10-03 — `button {
font-family }`, which had kept every `font-mono` button (Copy, Back, Map, the
live map's subjects) in the sans — the class is on each Oats
surface root in `OatsWorkspace.tsx`, and deliberately _not_ on the Advanced
Settings branch, which is the inherited app and should keep looking like itself.
Never reach for `.input-inline` inside an Oats surface; it is the per-element
opt-out for legacy components only.

A box that must never scroll is `overflow-clip`, not `overflow-hidden`:
`scrollIntoView` scrolls hidden ancestors too, and a hidden box has no scrollbar
to scroll back — a search result once shifted the whole workspace and its nav 8px.

### Two interfaces, and the field is one of them (2026-08-25)

The pastoral world was deleted on 2026-08-20 because Oats carried two brands at once and the landscape won every screen. It is back, as an **opt-in second mode** rather than the product's face: `uiMode` is `work` (the ledger — paper, graphite, gold, default) or `field` (sky, horizon, wheat, chaff). `helpers/uiMode.mjs` resolves it; `.oats-field-mode` on the shell gates everything. `DESIGN.md` §9.8 remains the **conversation contour**. Work mode must stay exactly what it is — the field may not leak into it, and no scenery belongs on a work-mode surface.

**The field is the original WebGL renderer, recovered from `575102d^`** — `components/conversation/field/` (GL, with a 2D-canvas fallback, one model). Do not rebuild it in CSS; a hand-rolled SVG field was tried and is not close. It keeps its three props, and they are load-bearing:

- `live` — the wheat is grown. Always true in field mode; an empty sky is not a field.
- `animate` — the wind. **Only while recording.** The renderer comes to rest _only once the wheat withdraws_, so `live` and `animate` both on permanently measured **128.6 points of a core**. Split, the standing field measures **0.7**.
- `intensity` — 1 on Conversation, 0.42 on the reading surfaces, because §9.8 forbids the world competing with a word.

**The world never goes behind text.** Wheat is a dithered texture at roughly body-copy contrast. The reading column gets its own paper — one circular gradient on a square box sized in `vmax`, falloff completing inside it. A radial sized in percentages of a tall column is an _ellipse_ and shows its edge as an arc; two composited masks cure the arc by drawing a rectangle and cost two mask layers.

**One cursor displaces one place.** The renderers carried a depth _parallax_ that shifted every blade by the pointer's offset from centre, gated by a binary flag — so the mouse slid the whole field and leaving it snapped back. Removed; what remains is the local parting inside `POINTER_RADIUS`, on a 0..1 ramp that holds the last position while it fades. The pointer effect exists only while animating (`still ? null : pointerRef.current`), so at rest the cursor does nothing.

**No backticks in `shaders.ts`.** The whole shader is a JS template literal; one in a comment ends it, and the parse error points at the GLSL rather than at the comment.

Stages 8–10 in `IMPLEMENTATION.md` are built but not yet exercised against real
speech. The repository contains inherited OpenWhispr components throughout; they
are not the product authority.

### Editing the conversation contour — what will bite you

The signature mark: geometry in `src/helpers/conversationContour.mjs` (pure, DOM-free, pinned by `test/helpers/conversationContour.test.js`), pixels in `components/conversation/ConversationContour.tsx`.

1. **Every element must come from speech.** The contour is the product's claim that its signature is evidence rather than decoration. A value invented by a noise function, a seed, or elapsed time alone breaks that claim, and the test pins it — two different conversations must not draw the same trace.
2. **Utterances are instants; speech is not.** They arrive with one timestamp and no end, and sampling them as instants put thirty spikes into ninety-six buckets and drew the same flat comb for every conversation. Each utterance is spread across the time it plausibly took to say (`WORDS_PER_SECOND`), and speech from outside the window is dropped rather than clamped onto its edge — clamping piles a previous sitting onto x=0, where the spreading then smears it into a solid slab.
3. **Dither density is information** — the §4 uncertainty encoding, so state survives greyscale and colour-blindness. Never tune it for looks.
4. **Nothing may call `getComputedStyle` in a draw.** The palette is read once per document and published to every canvas (`subscribeToPalette`); one observer per instance cost ~150ms on a theme toggle with a hundred conversations listed.
5. **`min-h-0` belongs on the section too, not only on the scrolling band.** The recording surface is a pinned head, a scrolling annotations band and a pinned foot. A flex child defaults to `min-height: auto`, so without `min-h-0` on the _section_ it grows past the pane, the band's `overflow-y-auto` never becomes a scroller, and a busy conversation pushes the dead-microphone warning to y=836 in an 800px window that cannot scroll. Measure it (`getBoundingClientRect().bottom` against `window.innerHeight`) — a clipped warning looks like a short warning in a screenshot.
6. **There is no animation loop, and adding one is a regression.** It redraws on data change. The renderer this replaced held vsync open repainting an unchanging picture and cost 113% of a core at idle.
7. **Nothing may draw a contour you cannot see.** The Intelligence list gates each row's strip — and its transcript parse — on an `IntersectionObserver`; ungated, 100 conversations cost 101 canvases and 18.9MB of backing store retained for the process lifetime. Grade small CSS marks with hard-stop rules, never sub-pixel gradient radii: at the 8px state mark Chromium quantizes them to all-or-nothing, which is how the least-settled state shipped drawing 0% ink.
8. **A `[]` or `{}` default parameter is a memo bomb.** `useContour`'s hooks take module-level `NO_TOPICS`/`NO_EVENTS` constants because a fresh literal each render defeats every downstream `useMemo`; the version with defaults cost 148–172ms per keystroke in production mode.

### The recording surface's four silent failures

All four were "fails quietly at the end", which the pencil standard forbids, and all four are now watched. Do not simplify any of them back:

1. **The checkpoint's result is read, not `void`ed.** `flushTranscriptCheckpoint` awaits `updateNote` and only advances `checkpointLastWritten` on success, so a refused write is retried by the next utterance instead of assumed done. Discarding the promise again restores an hour-long recording that fails at `stop`.
2. **A stalled backend is not a quiet room.** `micSilentSince` watches the audio _level_, so a dead Whisper server leaves it perfectly healthy while nothing is transcribed. `transcriptionStalled()` (`helpers/recordingHealth.mjs`) compares sustained sound against `lastSegmentAt`, falling back to the recording's start so a backend that never came up is caught on the first conversation.
3. **The grace periods are the feature, not padding.** 20s for a failed write, **90s** for a stall. A fan sits above the silence floor all meeting, and a warning that cries wolf makes somebody stop a healthy recording to check — causing the loss it exists to prevent. One problem, one warning: a dead microphone suppresses the stall notice.
4. **Finish is capture, then main, then listeners.** `stopRecording` releases capture, awaits `meetingTranscriptionStop` with the IPC listeners still attached, and only then cleans up; the post-conversation save waits on `isTranscribing`, and `startRecording` waits on an in-flight stop. Removing listeners first (the inherited order) discarded everything main transcribed while stopping — 34s of a 72s conversation, measured.

`MeetingRecordingMount`'s tick runs on `performance.now()`; anything it publishes for these checks must be `Date.now()`, or the comparison is ~0 against ~1.7e12 and the warning silently never fires.

### Dictation quality is measured, not argued (2026-08-24)

`scripts/asr-eval.js` runs the real path — the app's own `buildWhisperServerArgs`, the shipped `whisper-server` binary — over LibriSpeech test-clean and reports WER and latency. Numbers and the fork/upstream comparison in `docs/dictation-accuracy.md`. Never claim a transcription change helps without a row from it.

- **`--no-timestamps` is load-bearing.** whisper.cpp v1.9.x enables a 60-character segment wrap that lands on token boundaries with `split_on_word` off, so words break in half ("overh anging"). We read only `text`, so removing it costs nothing. Do not drop the flag. It has a second effect: with no timestamps whisper.cpp cannot seek, so it skips every 30s window after the first — **never send one request more than ~25s** (whole-recording WER 19% against 6%).
- **A room is cut at pauses, never fixed chunks** (`helpers/speechSegmenter.mjs`, 20s cap). The 5s chunk the call path still uses lands mid-word about once per chunk: 15.2% WER against 6.2% on the same conversations, and pause cuts are within a point of cutting at the true turns.
- **Who said it, in a room, is decided after Finish**: the segmenter's WAV → `diarize` with TitaNet (`IN_ROOM_EMBEDDING_ONNX`, threshold **0.85** — TitaNet's scale; CAM++'s 0.55 split everyone) → `conversation-speakers` → `applyConversationSpeakers` → `assignSpeakers` by each segment's `startMs`/`endMs`. Those offsets and the segment `id` must survive `serializeTranscriptSegments`: stored segments carried no id until 2026-10-04, so search landing and mark links silently missed on every real conversation (old ones now parse as `legacy-N`).
- **`base.en` ships beside `base` and is chosen automatically for English** (`helpers/whisperEnglishModel.mjs`) — same size, 38% fewer errors, 4.4x faster than the old default. It is absent from the model picker on purpose (`englishOnly` in the registry): it is not a tier to weigh, and the selection falls back silently when the file is missing.
- **`preferredLanguage` defaults to `auto` deliberately**, which forces the multilingual model. Guessing English from the OS locale is right often and catastrophic when wrong; slow is recoverable, wrong is not.
- The pre-Oats `../oats` tree and OpenWhispr itself (1.10.2, 2026-10-02, clone at `../openwhispr-upstream`) sound clearer only because they default `useLocalWhisper` to **false** and transcribe in the cloud. Locally the two are within a point of each other. We forked 1.7.6.

### Transcription scopes — the trap that broke recording

Transcription is configured per scope: dictation (`useLocalWhisper`), meeting (`meetingUseLocalWhisper`), and upload (`uploadUseLocalWhisper`). **Recording a conversation — the primary action — reads the _meeting_ scope**, via `selectResolvedMeetingTranscription`. The visible Settings page has one processing choice, so it must write every scope — **call `setCloudTranscriptionForAllScopes`, never a hand-picked list of setters.** This has now bitten twice: writing only `useLocalWhisper` made "On this computer" appear selected while recording still reached for OpenAI, and writing every field _but_ `meetingCloudTranscriptionMode` left it empty, which resolves to `"legacy"` and throws "OpenAI realtime requires a bring-your-own-key API key" with the key already saved. All three default to local, because Oats bundles a Whisper model and promises to work offline with no account. There is also a legacy `meetingFollows*` migration in `settingsStore.ts` that copies dictation values into meeting fields for pre-existing installs — it does not run for fresh ones, which is why the defaults themselves have to be right.

## Rules

- **Verify by measurement, never by reading.** Every false "fixed" claim in this codebase's history passed a re-read and failed a probe. Drive the built app (`npm run perf:baseline`, or headless Chrome over `src/dist`) and assert on `getComputedStyle` / `getBoundingClientRect`.
- **All user-facing strings go through i18next**, in all ten locales (`src/locales/{lang}/translation.json`: `en, es, fr, de, pt, it, ru, ja, zh-CN, zh-TW`), checked by `npm run i18n:check`. Do not translate brand names, technical terms, format names, or AI system prompts.
- **Never bulk-transform casing across locales.** Capitalising first letters is sentence case in nine of the ten and a spelling error in German, where every common noun carries a capital — and `i18n:check` compares only key sets and placeholders, so it ships. Anchor any scripted locale edit on `"key": "value"`, never on the value alone: a value like `"copy"` matches its own key name and silently renames it.
- **Run `npm install` under Node 24** (`.nvmrc`, matches CI). Another major version writes a `package-lock.json` that breaks `npm ci`.
- **A new sidecar binary is five edits, not one**: download script in `scripts/` wired into `prebuild*`, manager in `src/helpers/` initialized in `main.js`, `detached: process.platform !== "win32"` on spawn with `sidecarPidFile.write`/`.clear`, the binary fragment in `EXPECTED_BINARY_FRAGMENTS` (`sidecarReaper.js`), and `sidecarRegistry.register(name, () => manager.stop())` in `registerSidecars()`.
- **A new IPC channel is two edits**: `ipcHandlers.js` and `preload.js`.

## Gates

`npm run verify:oats` — setup check, tests, lint, format, renderer build. Tests under `test/` are linted as **scripts**: use `require` plus `await import("...mjs")` inside `test.before`, never top-level `import`, or `format:check` fails with "'import' and 'export' may appear only with sourceType: module". `npm run test:oats:core` is the fast inner loop (pure helpers under `node --test`). `npm run i18n:check` for locale parity. `npm run perf:baseline` drives a real second instance; procedure and numbers in `docs/performance-baseline.md`.

## Where everything is

`docs/architecture.md` — the module map, model registry, platform hotkey integrations, meeting detection, settings and secret storage, troubleshooting. `docs/openwhispr-inventory.md` — every renderer surface classified by import reachability: which files are the product, which are the inherited app kept behind Advanced, and what was deleted. `DESIGN.md` — the binding visual spec. `IMPLEMENTATION.md` — build stages. `TODO.md` — the live tracker. `docs/network-allowlist.md` — what leaves the device.
