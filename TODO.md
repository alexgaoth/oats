# Oats — outstanding work

**Status:** working document · **Created:** 2026-07-28 · **Supersedes nothing** —
this is the high-level tracker; `IMPLEMENTATION.md` holds the stage detail and
`DESIGN.md` holds the visual spec.

Three things are unfinished: the release proof (Stage 7), the features that make
Oats worth choosing (Stages 8–9), and the sleek pass that makes it look like the
design language says it should (Stage 10).

---

## A. Release proof — Stage 7

| Item                                        | State | Blocker                                |
| ------------------------------------------- | ----- | -------------------------------------- |
| Fedora 44 RPM **build**                     | ✅    | — built 2026-07-28, see below          |
| Fedora 44 RPM **install + smoke test**      | ⬜    | needs a system install + a GUI session |
| macOS notarized DMG                         | ⬜    | needs a Mac + Apple Developer ID       |
| Live network trace (incl. auto-search case) | ⬜    | needs packaged app + capture tool      |
| Idle/active CPU & memory measurement        | ⬜    | needs a real GUI session               |
| Auto-update decision (arum feed vs manual)  | ⬜    | decision, not work                     |

**RPM built 2026-07-28:** `dist/Oats-1.7.6-linux-x86_64.rpm` (455 MB) after
`libxcrypt-compat-4.5.2-3.fc44` cleared the `fpm` blocker. Read-only inspection
confirms it is well-formed: `oats 1.7.6-1 x86_64`, MIT, `/opt/Oats/oats`,
`/usr/share/applications/oats.desktop`, sane runtime deps (gtk3, nss, libnotify,
pipewire, xdg-utils), and the bundled `resources/bin/whisper-models/ggml-base.bin`
— so Stage 6's offline-capable first run genuinely ships. Note the build predates
the Stage 8–10 code; rebuild before using it as release evidence.

Installing and launching it is deliberately left to a human: it is a system-wide
install, and the smoke test needs a real desktop session. The rest need hardware
or credentials this machine does not have, and must not be reported as done until
somebody runs them.

---

## B. Catch every question — Stage 8 — ✅ built, ⬜ untested live

The product's core promise. Done in code and green under `verify:oats`. What is
not done is proving it against a real microphone and a real classifier.

### B1. Split detection from judgement (`conversationAide.mjs`)

- Fire a `question_detected` callback **synchronously** from `onFinalized` when
  `isQuestionCandidate` passes. No model, no network, no delay.
- Persist the `question` event at detection time so the card has a real id.
- Keep the classifier running on its own schedule; its result **updates** the
  existing question event and card rather than creating a second one.

### B2. Stop dropping questions

- Remove the `assessment.isAnswered` early-return. Answered questions persist as
  records and simply never trigger a search.
- Remove `suggested`, `cooldownMs`, `candidateDedupeMs`. Every asking is kept.
- Add a **group key** so repeats and rephrasings nest under the first card
  instead of being suppressed. Grouping is presentation; persistence is total.

### B3. Card lifecycle

- States per `DESIGN.md` §4: `asked` → `answered` | `uncertain` | `open`.
- `onRetracted` must withdraw a card already on screen, not just unstage a
  candidate — cards now appear before the transcript settles.
- Persist card state so the lifecycle is reconstructable from events alone.

### B4. Auto-open search

- On `uncertain` or `open`, open the encoded search through the existing
  host-validated `buildSearchUrl`/`validateSearchUrl` path.
- Background, non-focus-stealing (`activate: false` where the platform allows).
- Never on `answered`. One Settings toggle, default on.
- Mark the card `searched · google` so the network action is visible.

### B5. The card rail (UI)

- Replace the single-card assist window with **one persistent rail window** that
  lives for the recording and renders the whole stack.
- Newest at the bottom, repeats nested and dimmed, >4 collapse into a count chip.
- Never modal, never focus-stealing, never taller than half the screen.

**Done when:** the README manual question-card test passes end to end. ⬜ — the
code is in and unit-tested (`test/helpers/conversationAide.test.js`, 19 tests);
what is missing is one real recording.

---

## C. Threads and topics — Stage 9 — ✅ built, ⬜ untested live

The blocking data model now exists (`src/helpers/conversationTopics.mjs`, 10
tests). Both widgets are built on top of it.

### C1. Topic & thread data model

- New tables for topics and transitions (the existing `conversation_events`
  `CHECK` constraint would need a table rebuild, and topics are a different
  shape anyway).
- Local, cheap topic-shift detection over finalized utterances — no model call,
  it runs live during recording.
- Thread states: `live` / `open` / `resolved` / `dropped` (`DESIGN.md` §4).
- Persist **transitions**, not just topics: the edges are the product, and the
  return-to-an-earlier-thread edge is the most valuable mark on the graph.

### C2. Open-thread stack (during recording) — `DESIGN.md` §9.3

- Collapsed thin rail by default: count + top thread title, one line.
- Expands in place, auto-collapses when someone speaks, never expands itself.
- A reminder, not a task list: no checkboxes, no assignment, no urgency.

### C3. Topic graph (Intelligence) — `DESIGN.md` §9.4

- Force-directed canvas: nodes are topics sized by time spent, edges are
  transitions, dither density encodes state.
- Simulation is capped and comes to rest — no permanent CPU burn.
- Node selection opens a side panel of that topic's questions with re-search.
- Under four topics, render the linear thread list instead.
- Layout persists per conversation.

**Done when:** a wandering conversation that returns to an earlier thread
produces a graph showing the return edge, and the stack lists exactly the
threads that were dropped. ⬜ against real speech — proven against scripted
utterances only. The detector's thresholds have never met a real conversation,
and that is the one risk that can still make both widgets useless.

---

## D. The sleek pass — Stage 10 — ✅ built, ⬜ unreviewed

### D1. Restore design conformance

- Husked-oat seed instead of the lucide `Sparkles` placeholder.
- Wire the **listening pulse** — `oats-breathe` currently has zero consumers.
- Warm empty states; motion tokens on view swaps.
- Apply the sleekness budget (`DESIGN.md` §1) to all three surfaces.

### D2. Settings — essentials and Advanced

- Visible page, and nothing else: processing choice, microphone, language,
  hotkey, auto-search toggle, data controls.
- One quiet `Advanced` entry at the bottom for models, providers, endpoints,
  classifier tuning, diagnostics, legacy config. Never default-expanded, never
  linked from onboarding or an error.
- Route the 2,969-line `SettingsPage.tsx` behind Advanced rather than keeping
  two live settings implementations.

**Done when:** the visible Settings page fits one screen at 1280×800, and all
four signature surfaces match `DESIGN.md` §9 in both modes and reduced-motion.
⬜ — built and type/lint/format clean, but nobody has looked at it in either
colour mode. Design conformance is a visual gate; it cannot be closed from a
terminal.

---

## E. Follow-ups closed 2026-07-28

Gaps found by auditing the Stage 8–10 work against its own spec, all now fixed:

- **`resolveCurrent()` was dead code** — threads never reached `resolved`, so the
  stack would have nagged about conversations that actually finished. Replaced
  with `resolveTopicForUtterance(id)`, wired to the answered-question signal. It
  resolves the topic the _question_ was asked in, not the live one, because the
  verdict lands seconds later when the room has usually moved on.
- **Dead `conversationAideCooldownSeconds`** — a slider that controlled a cooldown
  Stage 8 removed. Deleted from the store, the setter, and the Advanced UI.
- **Topic graph was read-only.** Added node dragging, per-conversation layout
  persistence (normalized fractions in localStorage, so a resized window does not
  scatter it), and re-search from a selected node through the same host-validated
  main-process path as the live card.
- **Graph was keyboard-hostile.** Each topic now has a transparent focusable
  button over it with an `sr-only` label; the canvas is `aria-hidden`. This is the
  keyboard and screen-reader path in, per DESIGN.md §12.
- **i18n.** All five new/rewritten components now use `useTranslation`. ~60 keys
  added across all 10 locales; `npm run i18n:check` passes.

## G. Follow-ups closed 2026-07-28 (second pass)

- **Auto-search was too eager.** It fired on anything that was not a clean
  answer — including silence and hedges. Now only a _confirmed negative_
  (`denied_knowledge` above the confidence threshold) opens a browser; silence,
  hedges, and low-confidence denials record their outcome and stop. Card states
  are now `asked` / `answered` / `uncertain` / `silence` / `denied`.
- **Floating oat.** It already dragged; the dragged spot is now persisted (as a
  fraction of the display's work area, so it survives restarts, resolution
  changes, and a move to another monitor) and there is a hide button on hover,
  with the tray toggle as the way back.
- **Sample conversation.** `npm run seed:sample` writes one realistic founder
  conversation — pricing, hiring, the slipping demo, and a deliberate return to
  pricing — through the _real_ tracker, so the graph shows what the detector
  actually produces. `npm run seed:sample -- --remove` deletes it.
- **The seed immediately exposed a bad detector**, which is what it was for. The
  first run produced 12 fragmented topics, zero return edges, and labels like
  "don't i've never". Three fixes: match on **coverage of the utterance** rather
  than Jaccard (a topic's vocabulary grows, so a symmetric measure stops
  recognising long-running threads); name a topic from its **most repeated**
  words rather than its opening sentence; and hold an unmatched utterance for
  **one turn** before committing a topic, since one off-topic sentence is an
  aside and two is a subject change. Single-utterance stubs are folded into their
  successor. Result on the same conversation: **4 topics, 1 return edge**, labels
  "enterprise pricing", "engineer research", "flow onboarding", "investor update".

## H. Three feature additions — built 2026-07-28

All three from the README's feature-additions note, all `verify:oats`-green and
unit-tested, none yet exercised against real speech.

- **Topic suggestions** (`conversationSuggestions.mjs`). Inside the expanded
  open-thread stack: threads left open, topics barely touched, and subjects that
  historically accompany the live one. Local set intersections, no model call.
  Ranked so a thread this room opened always outranks anything history offers.
- **Better question cards.** Repeats now gather under one card with an
  "asked 3×" count rather than stacking near-identical bodies; added elapsed
  time, calmer hierarchy, and a 15s age tick so the always-on-top window is not
  the thing moving in the corner of your eye. **Closed a real gap:** the README
  promised "the search is one click away on the card" and the card had no search
  action at all. It does now, for every outcome that did not auto-search, routed
  through the same host-validated main-process path (the overlay sends a card id,
  never a URL).
- **The lifetime graph** (`lifetimeGraph.mjs`, `LifetimeGraph.tsx`). Nodes are
  conversations, edges are shared subjects, caption names what recurs. Reached
  via a `Map` link in Intelligence — not a fourth surface. This reverses the
  documented "cross-conversation topic graphs are out of scope"; entity linking
  stays out.
- **`TopicGraph` was split into `ForceGraph`** so both graphs share one
  simulation, one dither vocabulary, and one keyboard path.

### What the seed caught this time

Extending `npm run seed:sample` to three linked conversations immediately showed
the lifetime graph finding **no edges at all** between conversations that
obviously shared a subject. Three fixes, each a real defect rather than a tuning
nudge:

- `topic.words` was in **insertion order**, so consumers taking the leading words
  as a fingerprint got whatever was said first rather than what the topic was
  about. Now frequency-ordered.
- Matching compared **whole word bags**, which dilutes as topics mature. Now
  compares the top-5 fingerprint, at a looser threshold than within-conversation
  matching, because conversations months apart share vocabulary poorly.
- Edges were **labelled by one side's topic name**, which reported "churn cohort"
  for a link that was actually about enterprise pricing. Now labelled by the
  words the two topics genuinely share.

## I. Dictation fixes + the field (2026-07-28)

- **Dictation pasted the previous clipboard.** Root cause: `wl-copy` does not
  exit — a Wayland clipboard offer is served by a live process — so the old
  `spawnSync(..., { timeout: 50 })` always timed out, killed it, and tore the
  offer down. The clipboard kept its old contents and the paste chord inserted
  them. Now: Electron's own clipboard first (it is already a Wayland client),
  then detached `wl-copy`, then the renderer — each **verified by reading the
  selection back**, and a paste is _refused_ rather than sent over an unverified
  clipboard.
- **In-room recording can no longer request screen capture.** It was only
  avoided because the access probe happened to report "unsupported";
  `prepareMeetingSystemAudioCapture` now hard-refuses for `in_room`.
- **`linux-fast-paste` does not compile on this machine** (missing X11 headers) —
  `sudo dnf install libX11-devel libXtst-devel`, then `npm run compile:linux-paste`.
  Without it, paste falls back to xdotool/ydotool, and the GNOME RemoteDesktop
  portal path (the "share your screen" dialog) is what gets reached when those
  fail. Installing the headers is the real fix for the prompt.
- **Wheat field** (`components/conversation/wheatField/`, DESIGN §9.8) behind the
  Conversation surface while recording. Pseudo-2D on the GPU: six depth bands of
  instanced blades, growth staggered from the horizon forward, two travelling
  gusts, and §7's ordered dither in the fragment shader — the first animated
  grain anywhere in the product. No meshes, no downloaded assets. Falls back to
  a 2D canvas drawing the same field where WebGL2 is missing or software-only,
  thins itself if the frame budget slips, pauses on `document.hidden`, and
  freezes to one still frame under `prefers-reduced-motion`.
  - Measured on the Fedora target (Intel ARL via ANGLE, under Oats' own
    `--disable-gpu-compositing`): ~0ms blocking CPU cost, and software
    compositing readback costs ~1.8ms/frame at 2x DPR. WebGL reports
    `enabled_readback`, not SwiftShader.
  - Still unverified on Apple Silicon, and the gust cadence has not been watched
    for a full conversation by a human.
- **Continuation prompt**: stopping and starting again within 30 minutes asks
  whether it is the same conversation, and resuming appends to the same note so
  there is one transcript, one summary, one set of threads.

## J. Quality-of-life pass + detection robustness (2026-07-29)

**Why detection felt worse.** Partly the model, mostly my own changes raising the
stakes on it. The classifier is `qwen2.5-1.5b-instruct-q5_k_m` — a 1.5B model
asked for exact six-key JSON _with a calibrated confidence_. Three of my changes
made every weakness in that output visible:

1. Malformed JSON used to mean "no card appeared"; after the rewrite it meant a
   card **stranded at `asked` forever**.
2. `isFactualQuestion: false` **withdrew a card already on screen**, so an
   unconfident model made the rail flicker.
3. Auto-search required `denied_knowledge` **and** confidence ≥ 0.75 from a model
   whose confidence is not calibrated, so it almost never fired.

**The fix is to stop depending on the model for the common case.**
`assessResponseLocally()` reads the reply directly — denial, hedge, backchannel,
substantive answer — and is now the _primary_ verdict; the classifier may only
override it when confident. Classifier failure or malformed output now resolves
the card locally instead of stranding it, and a card is only withdrawn when the
model is confident it is not a question. Denial detection no longer needs a model
at all, which is what makes auto-search fire again.

**QoL shipped:**

- **Nothing heard** — an empty conversation deletes its note and says the mic
  heard nothing, instead of leaving a blank in Intelligence.
- **Mic-died detection** — a flat noise floor for 30s during recording surfaces a
  quiet warning while there is still time to fix it.
- **Transcript checkpointing** every 20s — a crash used to lose the whole
  conversation, which is the one failure that cannot be retried.
- **Inline rename** on the Intelligence title.
- **Undo dismiss** (6s) on question cards.
- **"Left open last time"** — opening a conversation shows what the previous
  conversation on the same subject left unfinished, reusing the lifetime graph's
  matching.
- **Search across conversations** over title, summary, and transcript.

## K. Autopaste on GNOME Wayland (2026-07-30)

**Screen sharing is never required to paste.** The RemoteDesktop portal is one of
three ways to inject keystrokes on Wayland; uinput and ydotool are the others,
and this machine can use uinput.

**Root cause of "reports success, pastes nothing":** `resources/linux-fast-paste.c`
waited `usleep(50000)` — 50ms — between `UI_DEV_CREATE` and typing. Creating a
uinput device starts a chain (kernel → udev → libinput → compositor opens it)
that on mutter routinely takes longer than 200ms. Every key write below the sleep
succeeded because the _kernel_ accepts them, so the binary exited 0 and logged
"Paste successful" while the compositor was not yet listening. Silent, and
indistinguishable from success in the logs. Now 300ms.

**Secondary:** the GNOME branch now skips the one-shot uinput device when
`ydotoold` is usable, because a long-lived daemon device has already been
enumerated and cannot lose that race. On this machine it is _not_ usable —
`ydotoold` runs as root with `/tmp/.ydotool_socket` at `srw------- root root`, so
the user's client cannot reach it. Either run it as a user service or ignore it;
uinput works, since an ACL grants `alexgaoth` rw on `/dev/uinput`.

**wl-copy process pile-up.** Each dictation left one wl-copy resident (a Wayland
clipboard offer is served by a live process) and the post-paste clipboard restore
left a second, so they accumulated all session. `_ownWaylandClipboard` now keeps
exactly one alive: taking the selection makes every earlier owner redundant, so
the previous one is retired 250ms after the replacement is up — late enough that
ownership never has a gap. The last owner is deliberately left running at quit,
because killing it would wipe the user's clipboard on exit. Verified: three
writes in sequence leave one process, holding the newest value.

**Also fixed this round:**

- **Both clipboard selections are now written.** Under XWayland
  `clipboard.writeText` owns the X11 selection while native Wayland apps read the
  Wayland one. The previous code verified Electron's write by reading Electron's
  own clipboard back — a check that could only confirm what it already knew — and
  returned before `wl-copy` ever ran, leaving the Wayland selection empty.
- **`wl-paste` circuit breaker.** It has been observed hanging indefinitely, even
  on `--list-types`. One timeout now retires it for the session rather than
  costing every future dictation another stall.
- **Only the question is quoted**, not the whole turn it arrived in
  (`extractQuestionSentence`).
- **Manual search on any card**, using the question itself when no query has been
  derived yet.
- **Searches open in a new browser window** via `xdg-settings` + `--new-window`,
  so results land on the current workspace instead of a tab in a window elsewhere.

## F. Post-v1

- **iPhone** — a second implementation, not a port. Companion-to-Mac favored.
  Scoped in `IMPLEMENTATION.md` §8. Not started, deliberately.
- **Delete `IMPLEMENTATION.md`** once every stage row is ✅ and the release
  evidence is filed; the README status section then carries what a reader needs.

---

## Ordering

A1 (RPM) is independent and can run alongside anything. Otherwise: **B → C → D**.
B is the promise, C needs a data model before any pixels, and D is worth doing
last so it is applied to the finished surfaces rather than to placeholders twice.
