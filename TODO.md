# Oats — product, performance, and UI backlog

**Status:** audit written 2026-08-19; **worked 2026-08-19/20**. `DESIGN.md`
remains the visual specification; this file tracks what the review found, what
has been done about it, and what is left.

Everything marked **done** below was verified by running the application, not by
reading the code. The instrument is `npm run perf:baseline`; the evidence is
`docs/performance-baseline.md` and `docs/perf/*.json`.

## Executive assessment

The Oats core is promising, but the product still behaves in places like a new
Oats shell layered over a large OpenWhispr application. The visible surfaces are
now genuinely separated from the inherited ones; the question-card pipeline is
not.

The performance question is no longer open. It was measured, and the review's
suspicion was correct and worse than suspected: idling on the Conversation
surface with **no conversation running** cost **113 % of a core**. It is now
**17 %**, level with the other two surfaces. See "P0.1" below.

`npm run verify:oats` passes with zero lint problems.

## P0 — establish and fix performance

### P0.1 Freeze the field outside the active Conversation surface — done

`Field` takes an `animate` prop; `OatsWorkspace` passes
`surface === "conversation"`. Both renderers (`FieldGL` and the 2D `FieldCanvas`
fallback) draw one settled frame and then **stop scheduling entirely** — an rAF
callback that returns early still holds the compositor at vsync, which is the
cost worth avoiding. A `wake()` handle restarts them, and the things that change
what a settled frame should look like call it: theme change, resize, and any
change to `animate`, `intensity` or `live`.

Two findings extended the original scope:

- **A theme switch lives on a frozen surface.** Oat milk ↔ steel-cut is changed
  from Advanced Settings, so a frozen field would have kept the old palette. The
  palette observer now wakes the loop for one frame.
- **The field was also redrawing an unchanging picture on Conversation itself.**
  With no conversation running the wheat is absent, the chaff and blades are
  gated on `grow`, and the backdrop shader reads `uTime` only inside
  `uGrow > 0` — so every frame was byte-identical. The loop now comes to rest
  once the wheat has withdrawn and wakes when recording starts. This is where
  the 113 % → 17 % came from.

**Verified** (`animate` toggled in a WebGL2 harness, and by driving the real
application over CDP with rAF and `drawArrays` counted from outside the product
code):

| State                        | rAF / 3s | GL draws / 3s |
| ---------------------------- | -------- | ------------- |
| Conversation, recording      | 123      | 123+          |
| Conversation, idle (settled) | **0**    | **0**         |
| Intelligence                 | **0**    | **0**         |
| Settings                     | **0**    | **0**         |
| Recording again              | 128      | 128+          |

The grow → recede → rest lifecycle was checked separately: idle 0 draws →
recording 376 draws/3s → receding still animating → settled back to 0.
`prefers-reduced-motion` is unchanged (it was already a single still frame, and
now also repaints on a theme change, which it previously did not).

### P0.2 Measure the regression before declaring it fixed — done for Fedora, open for macOS

`scripts/perf-baseline.js` (`npm run perf:baseline`) launches an isolated Oats on
the staging channel, drives the surfaces over CDP, and reports cold launch, warm
reload, per-surface switch p50/p95, first Settings open, first Advanced open, and
**per-surface** idle CPU and RSS. Results and procedure:
`docs/performance-baseline.md`.

Still open, because a script cannot substitute for hardware: Apple Silicon,
occluded idle, active-recording cost, a realistic 60-minute conversation, and the
upstream comparison. All are listed in that document.

### P0.3 Scope global motion — done

- The universal `* { transition: background-color, border-color, color }` is
  gone. Colour transitions are now declared on the elements that answer you —
  `a, button, input, select, textarea, summary, [role=button|tab|option|switch],
.card` — using `--motion-instant` and `--ease-oats` rather than a literal
  150ms, per `DESIGN.md` §8.
- `OpenThreadStack`'s `transition-all` is now
  `[transition-property:grid-template-rows,opacity]`, which is the one sanctioned
  height animation and nothing else.

## P1 — make Settings genuinely small and fast

### P1.1 Lazy-load Advanced Settings — done

`SettingsPage` is a `React.lazy` chunk behind a quiet `Suspense` line
(`oats.settings.advancedLoading`, added to all 10 locales).

**Measured**, by building both revisions: the chunk the default Oats path must
load fell from **385.40 kB (108.32 kB gzip) to 140.70 kB (46.98 kB gzip)**.
Advanced now costs 231.9 kB, and only if you walk into it — 362 ms on first open.

### P1.2 Stop retaining inactive screen work — resolved differently, deliberately

The remedy as written (unmount inactive surfaces) is declined, and the premise
turned out to be mostly wrong. What inactive surfaces actually do was checked:

- `useConversationEvents` has no polling — it reloads on `noteId` change.
- The graph settle loop is drag-triggered, alpha-decays and cancels itself.
- After P0.1 the field does not run at all off the Conversation surface.
- After P1.1 the retained _bundle_ is gone, which was the real cost.

So an inactive mounted surface now performs no continuous work, and the measured
idle CPU is flat across all three surfaces (17.1 / 18.1 / 16.7 %). Against that,
unmounting would cost two real things: the `<main>` panes staying mounted is what
makes `DESIGN.md` §8's cross-fade possible at all (there must be something left
on screen to dim), and Intelligence would lose your reading position and scroll
every time you glanced at Settings.

One genuine retention defect was found and fixed instead: `MicrophoneSettings`
stays mounted behind the other surfaces once Advanced has been visited, and its
`devicechange` listener could call `getUserMedia` — **opening the microphone on
a screen nobody is looking at** — when a headset was plugged in. Unlocking the
device labels now requires explicit intent.

### P1.3 Replace inherited microphone configuration UI — done

The visible page no longer mounts `MicrophoneSettings`. It has a purpose-made
control: one line naming the microphone the next conversation will use, and a
`change` action. **Nothing is enumerated until `change` is pressed**, so opening
Settings can no longer trigger a permission prompt or interrupt playing audio.

It also writes `preferBuiltInMic`, which wins over the selected device at
recording time (`getMeetingMicConstraints`) — a picker that let you choose a
device the recorder then ignored would be a setting that lies.

The richer device panel stays in Advanced, as specified.

### P1.4 Rebuild the visible Settings composition — done

- The microphone row is the new control above; no nested legacy panel remains on
  the visible page.
- **Removed a row.** "Start a conversation with" (the `meetingKey` slot) sat
  directly under "Conversation shortcut", and both claimed to start a
  conversation. Online meeting recording is not part of the primary information
  architecture, and Advanced already carries a full control for that slot.
- Rhythm and copy tightened: a wider label column so hints stop wrapping into
  paragraphs, `py-3` rows, and shorter hints. The auto-search hint kept its
  network claim — that is the one thing on the page a reader will check.

**Done when: the visible page fits at 1280x800 without feeling compressed.**
Measured in the running application at the control panel's own default window
size (1200×800, `windowConfig.js`): content **686 px** in a **694 px** pane —
`overflowBy: 0`, down from 288 px. Checked in both colour modes.

## P1 — integrate the signature question cards

### P1.5 One docked Conversation Signal Rail — done

**The decision was "always docked", taken 2026-08-20 with the trade-off stated.**
The separate always-on-top `BrowserWindow` is deleted, not demoted: cards live in
the Conversation surface and nowhere else.

What went with it — a whole contract, not just a window: the
`?conversation-assist=true` renderer route, `CONVERSATION_ASSIST_WINDOW_CONFIG`,
five IPC channels (`conversation-cards-set`, `conversation-cards-close`,
`get-conversation-assist-data`, `conversation-assist-ready`,
`set-conversation-assist-interactivity`), their preload and type entries, the
main-process card cache, the sanitiser that existed to police the wire, and the
cold-start `conversation-assist-ready` handshake. `conversation-card-search` went
too: it took a card id rather than a URL because the overlay was the least
trustworthy window in the app, and the rail is now the control panel's own
renderer, which already calls `conversation-search-open` directly.

Cards are published into `useMeetingRecordingStore.questionCards`, so there is
one copy of card state and nothing to keep in sync.

**The accepted cost:** a conversation recorded with the panel hidden — which the
global shortcut makes the normal case — shows no cards until Oats is opened.
Nothing is lost; every card already exists in the note, and the floating oat and
the tray still show that a conversation is running.

Verified in the running app: the rail is absent when idle, renders four groups
with the fifth behind an "earlier" chip, nests a re-asking under the question it
repeats, anchors 20px off the pane's bottom-right corner, and reads in both
colour modes. Every removed bridge method is gone from `window.electronAPI`;
`openConversationSearch` and `dismissConversationCard` remain. No console errors.

## P1 — remove the OpenWhispr seam

- **Done: the CSS boundary.** The inherited `input`/`textarea` chrome and `.card`
  rules are element/class selectors that outranked the utilities an Oats
  component set on itself, and the old fix was a per-element `.input-inline`
  opt-out that new markup had to remember. They are now scoped out of
  `.oats-surface` entirely — the boundary is the surface, not the element, so
  Oats markup cannot forget to opt out and Advanced Settings keeps looking like
  itself. `.input-inline` remains for the legacy components (note editor, chat
  input) that use it deliberately.

  Verified against the built stylesheet: an `input` outside the boundary gets
  `1px solid` + `8px` radius + inset shadow; the same `input` inside gets none of
  it. Same for `.card`.

- **Done: the inventory** (2026-08-22) — `docs/openwhispr-inventory.md`. Every
  renderer surface classified by import reachability over the whole repository's
  graph, not by reading: six entry points, **Oats primary 16 components / 5,332
  lines**, **Advanced Settings 46 / 11,242**, **agent overlay 12 / 1,318**, and
  **67 files / 10,471 lines reachable by nothing at all** — the whole OpenWhispr
  notes application, deleted, along with nine orphaned `ui/` primitives and five
  npm dependencies. The bundle moved only 4,176,411 → 4,121,110 bytes: it was
  weight in the repository, not in the build.

- **Still open: the enterprise and BYOK provider block.** It is the largest
  single piece of inherited surface area and the product direction allows
  exactly one API key. Isolating it further, or deleting the enterprise cloud
  credentials path, is a product decision nobody has made. Also open: the locale
  keys the deletion orphaned — `i18n:check` compares key sets between locales
  and cannot see a key that is consistently unused, and a scripted sweep across
  locale files is the operation `CLAUDE.md` warns about most.

  Keep the three-surface architecture; do not add a fourth shell to accommodate
  legacy features.

## P2 — make the product useful every day for high-signal people

Not started. These are product builds, not fixes, and each wants a decision
before code.

### P2.1 Source-linked local recall — first pass done (2026-08-23)

**Done: the excerpt and its provenance.** A result now shows the passage that
matched, marked, under a label saying where it came from — `said` for the
transcript, `summary` for what Oats wrote, `title` for the name, `related` for a
vector-index suggestion with no literal match. Transcript excerpts render in mono
(§5's verbatim voice), summaries in sans. Ranking is transcript > summary >
title, because what somebody said is better evidence than what a 1.5B model wrote
about it. Pure and pinned: `helpers/conversationRecall.mjs`, 8 tests.

Measured in the built renderer: `"seat price"` → `said: I do not know the median
seat price off the top of my head` (mono, marked); `"agreed"` → `summary: The
team agreed the demo would slip`; `"prep"` → `title: Board prep`; a semantic-only
result appears last as `related:` with nothing marked.

**Done: semantic recall is wired in.** `semanticSearchNotes` (Qdrant + local
MiniLM, keyword fallback in main) already existed and Intelligence was the one
surface not using it. It runs debounced at 220ms behind the literal filter,
never instead of it — literal results keep their order and their place at the
top. No index, no model, no network: the search still works exactly as before.

**Done: it jumps to the moment.** The reading view renders the transcript as the
timed record it is — a mono gutter of offsets beside each turn — instead of the
flat string the clipboard gets, so an hour of conversation finally has bearings.
A result carries `· 12:30` beside its provenance label, and opening it lands on
that turn: measured, `tab: Transcript`, gutters `0:00 / 1:00 / 2:00`, exactly one
turn inked, `inkedOnScreen: true`. A semantic result gets `null` rather than a
guess — landing somebody on a turn the search did not find is worse than landing
them at the top. A transcript with no segments falls back to the flat article
(measured), and `transcriptText` is untouched so copy and export are unchanged.

**Still open:** whether `related` results should appear at all when the literal
filter found nothing, or whether an empty literal result should say so first.

### P2.2 Add a compact post-conversation review

Decisions, commitments and owners where explicit, open and researched questions,
what changed since the last related conversation, and links to the exact
supporting utterances. A quiet review layer — not a task manager, not a chat
panel.

### P2.3 Evaluate local people/project memory after recall works

Only after P2.1 is accurate. A lightweight memory aid, not a CRM.

### P2.4 Add a problem-only trust/health surface

Microphone signal, local model readiness, last successful transcript checkpoint,
and any network action — surfaced **only** when it helps someone recover. The
pencil standard is silent when healthy and specific when it is not.

## Product truth and documentation — done

`PRODUCT.md` claimed nothing is searched, sent or shared until the user touches
it, and called the card "never automatically". The shipped behaviour, which
`CLAUDE.md` and `README.md` both state, is that a confirmed "I don't know" opens
a background search by default. `PRODUCT.md` was the outlier and has been aligned
in all three places: the trust bullet, the listening-loop step, and the
"earn the trust claim" milestone.

`LOCAL_WHISPER_SETUP.md` also carried the forbidden absolute ("nothing leaves
your device") and now says what is actually true of it — the recording never
leaves the device. `docs/network-allowlist.md` was already accurate.

## Accessibility and interaction fixes — done

- `OpenThreadStack` — `transition-all` replaced with explicit properties.
- Intelligence rename — the clickable `<h1>` is now a real `<button>` inside the
  heading, so it takes focus and answers Enter and Space. The rename input has an
  `aria-label`.
- Intelligence search — `type="search"` and an `aria-label`; the placeholder was
  its only name.
- API-key field — `id`, `name`, `aria-label`, `autoComplete="off"`,
  `spellCheck={false}`.
- `MicrophoneSettings` refresh — the icon-only button has an accessible name
  (`microphoneSettings.refresh`, added to all 10 locales) and the icon is
  `aria-hidden`.

## P1 — art-direction reset: private conversation ledger

The visual problem is not a missing polish pass. Oats currently carries two
brands at once: a high-signal, private conversation tool and a literal pastoral
world. The field system is a complete second identity — slate-blue sky, warm
horizon, wheat, birds, chaff, and a Japanese farmhouse — behind a product that
claims to be a quiet, pencil-like instrument for consequential conversations.

### The decision

**Retire the literal field world.** Keep the husked-oat seed and ordered dither;
remove the sky, birds, farmhouse, wheat blades, chaff, and the rule that a
scenery backdrop must always be present.

Blue and toasted yellow can work together in a landscape, but that is precisely
the problem: together they say pleasant summer landscape, wellness app, or
artisanal farm brand rather than private local intelligence. The slate blue is
not incidental: it is deliberately boosted on light paper even though the
design language says “no cold blues”. A code comment that calls it weather rather
than a brand colour cannot change the image a user sees.

The minka is visually specific but unearned by the product, audience, or story.
It should not survive merely because it is beautiful.

**Evidence:** `DESIGN.md` §1 and §3; `src/components/conversation/field/fieldModel.ts`
(`SKY_BLUE`, `SKY_LIGHT_BOOST`, and minka geometry);
`src/components/conversation/field/FieldGL.tsx`.

### Replacement thesis

Build Oats as a **private conversation ledger**, not a field:

> A living local record of thought, with the evidence of a conversation made
> visible but never made theatrical.

Its signature becomes a **conversation contour**: a thin dithered trace built
from actual speech density, topic shifts, questions, unanswered moments, and
returns to earlier threads. Dither must carry information — time, confidence,
or unresolvedness — rather than functioning as decorative wallpaper.

The oat is a grain in the margin, not a countryside behind the document.

### Conversation surface

- Keep the oat seed as the record/stop control and the sole recording signal.
- Replace the centred hero over scenery with a purposeful live composition:
  running time, a calm last-heard line, and a growing conversation contour.
- Render questions as margin annotations connected to their place in the live
  trace, rather than floating rounded cards from a separate application window.
- ~~Dock the shared Conversation Signal Rail in the control panel when it is
  open; use a detached overlay only when Oats is hidden or minimized.~~
  **Superseded 2026-08-20:** the detached overlay is deleted, not kept as a
  fallback — see P1.5 above. The rail is docked, always. What survives from this
  bullet is the part the reset actually cares about: cards must stop reading as
  "floating rounded cards from a separate application window", which is now a
  rendering question inside one surface rather than a windowing question.
- The live screen must foreground evidence, not atmosphere.

### Intelligence surface

- Make source-linked local recall the first visual action, available regardless
  of conversation count.
- Treat the opened conversation as an evidence reader: summary, decisions,
  questions, and exact transcript support in one flowing document.
- Use topic/thread marks in the transcript margin. Keep force graphs as a
  secondary **Connections** lens for a question that genuinely requires one,
  rather than making an Obsidian-shaped graph the default payoff.
- Show a small contour/marker strip beside conversations in the list so personal
  history has a recognizable visual grammar without scenery.

### Settings and onboarding

- Remove all scenery from Settings. It is a maintenance surface for hardware,
  privacy, and local processing; paper/charcoal, disciplined layout, and exact
  copy are enough.
- Redesign onboarding in the same system. The inherited card/wizard form,
  progress/footer controls, rounded pills, and Lucide icon furniture currently
  make first run look like a different product from the Oats workspace.
- Do not retain legacy rounded-card/pill language as the visual default just
  because it is already available in shadcn/OpenWhispr components.

### Palette, type, and hierarchy

- Use materials, not scenery: paper, graphite, flax signal, fog structure, moss
  for resolved state, and oxide for confirmed unknown/denial. Remove blue as a
  visual-world colour.
- Restrict flax/gold to a momentary recording/selection mark. It is not a general
  premium accent or body-text colour.
- Keep `oats` lowercase as the wordmark, but restore sentence case for interface
  labels, commands, and conversation titles. Persistent lowercase makes the
  product feel softer and more lifestyle-coded than the intended audience.
- Do not solve this by adding a fashionable display serif. Earn personality from
  the conversation contour, evidence hierarchy, and precise spacing first.

### Navigation and screen structure

- Reconsider bottom-centred navigation as the main desktop navigation model. It
  makes the app read like a consumer media experience and disappears during the
  moment the user most needs orientation.
- Preserve the three primary surfaces, but give each a stable, restrained
  orientation cue rather than relying on a shared horizon.
- The “one accent / one idea” rule is useful discipline, not an excuse for every
  screen to be empty or for meaningful state to become visually timid.

**Done when:** a real visual review can describe Oats as a private evidence tool
without mentioning a field, sky, rural scene, or meditation app; the signature
element is visibly derived from what was said in the conversation.

## Art-direction reset — what the review loop left open (2026-08-21)

The reset landed: the field is deleted, the conversation contour is the
signature, and the surfaces were rebuilt around it. Four rounds of adversarial
review across art-direction, pencil-test, accessibility and performance;
performance and pencil-test approved, art-direction and accessibility did not.
Full audit trail, 24 screenshots and every verdict in
`.iterate/20260820-ledger-reset/` — `WRAP-UP.md` first.

Outstanding, in priority order (2026-08-22 pass — items 2 to 6 closed):

1. **The question rail's live region may still re-announce a heard question.**
   Two fixes failed the critic's live test, so the third moved the decision out
   of the component: `helpers/questionAnnouncement.mjs` is pure and pinned by
   eight assertions covering dismiss, undo, reorder and repeat. Two further
   defects were found while pinning it — two questions arriving in the same
   segment announced only one of them, and a re-asking produced identical text,
   which a live region does not speak at all. Both are fixed and each case now
   reads differently (`announcedAgain`, `announcedBatch`, all ten locales).
   **Still not verified against a real screen reader**, which is the only test
   that has ever caught this.
2. ~~Rail dither grades ~3 points apart at the 8px card mark.~~ **Worse than
   logged, now fixed and measured.** At the real mark size the radial-dot grades
   measured 23.4% / 50.0% / **0.0%** ink at DPR 1 — `medium` denser than `fine`,
   and `sparse`, the state most cards sit in, drawing nothing at all. Sub-pixel
   gradient radii quantize; no amount of tuning fixes that. Hard-stop 1px rules
   measure 46.9 / 34.4 / 21.9 at DPR 1 and 43.0 / 30.5 / 19.5 at DPR 2 — monotone
   with ~12-point gaps, and in one ink the four marks read 85.8 / 160.5 / 182.2 /
   201.2 mean luminance. The contour keeps its Bayer stipple: it draws to a
   canvas at a 1px lattice, where fractional coverage is exact.
3. ~~The Connections graph and `topicLabel()`.~~ Both fixed. The label keeps the
   order the words were first said in rather than their frequency ranking, so
   "onboarding flow" stops rendering as "flow onboarding" (pinned). The graph was
   not below the fold as logged — measured, it sat at 452–868 in an 800px window,
   clipped by 68px at the bottom, on the one tab whose whole payload is a
   draggable picture. It is sized to the room left now: 452–788, fully visible.
4. ~~`CONTROL_PANEL_CONFIG` has no `minHeight`.~~ `minWidth: 880, minHeight: 680`.
   The floor comes from recording, not from the resting surfaces: head and foot
   occupy 565px at the default size and only the band can give. The three
   resting surfaces were driven to 880x560 with nothing left unreachable.
5. ~~The Intelligence list renders 100 unvirtualised contour canvases.~~ Drawn on
   intersection with 400px of lead, transcript parsing behind the same gate, and
   the box reserved at the strip's height so nothing reflows. Measured A/B in one
   harness at DPR 2 with 100 conversations: **101 canvases / 18.87MB → 6 canvases
   / 1.07MB** on open, and 12 / 2.2MB after scrolling the whole list. A row stays
   drawn once seen.
6. ~~Pre-existing dead code.~~ Larger than logged: not three `useSettings`
   destructures but ten, plus `readableVoiceAgentKey`, `validateVoiceAgentHotkey`,
   `validateHotkeyForInput`, `readableHotkey`, the whole `useHotkeyRegistration`
   call, and a ~50-line auto-register effect keyed on an `activation` step that
   the 2026-07-30 reduction deleted — `steps.findIndex` returns -1, so the effect
   had always taken its early return. `OnboardingFlow` 559 → 448 lines, five
   imports gone. `oats.settings.noShortcut` removed from all ten locales.

Not reviewed by any critic. Every claim above is a measurement; none is a
screen-reader test.

## Conversation surface — two compositions (2026-08-22)

Clean and Detailed (`DESIGN.md` §9.0, §9.9), switchable from the surface,
persisted, **clean by default** for fresh installs and for existing ones with no
stored value. Clean holds a stricter rule than "fewer elements": no text that
changes while somebody is speaking. Detailed adds the **detected dialogue** — a
live speaker-attributed transcript that did not exist before — plus the question
annotations and the open-thread stack. Detection, classification, auto-search,
persistence and assistive-technology output are identical in both.

Open, and wanting a decision rather than silence:

- **The switch lives only on the recording surface.** Deliberate: it is the
  moment you want it ("what did it just hear?"), and keeping it on screen in both
  states is what stops this being a mode to remember. But it means the
  composition can only be changed mid-conversation — someone who wants Detailed
  for their next meeting must interrupt one to say so. A Settings line is the
  obvious alternative and was rejected to keep Settings small.
- ~~Clean is still largely a subtraction.~~ **Answered 2026-08-23 by making it a
  composition rather than by resizing anything.** The reflow argument that pinned
  the recording surface to the top belongs to Detailed alone — the annotations
  and the transcript are what grow — so Clean was paying a cost it does not
  incur, as 464px of dead paper below the mark. It is centred now: measured
  balance above/below the block 1.03 at 1200x800, 1.03 at 1400x900, 1.04 at
  1000x700, dead-microphone warning still pinned and fully visible, page never
  scrolls. `justify-center` alone did nothing — the band below claimed `flex-1`,
  so there was no free space to distribute; `my-auto` on the head is what
  centres it. Enlarging the contour to 208px had been tried first and reverted:
  at that size it read as a slab rather than §9.8's one thin trace, and a bigger
  drawing was never going to answer the question.
- **No screen reader has been run.** Parity between the compositions is verified
  as DOM and AX-tree parity, which is not the same claim.

## Verification gates

Still requiring a real GUI session and realistic speech:

- Fedora install and smoke test from the RPM;
- notarized Apple Silicon DMG smoke test;
- real-speech question detection, question-state resolution, thread stack, and
  topic graph evaluation;
- dark/light and reduced-motion review of the _recording_ surfaces (the three
  resting surfaces were checked in both modes during this pass);
- release network trace, including automatic-search behaviour;
- the macOS half of the performance baseline, plus occluded idle and the
  60-minute conversation — see `docs/performance-baseline.md`.

## Noted in passing, not acted on

- **A killed Oats can leave a `pactl subscribe` child holding inherited file
  descriptors** — it was found holding a listening socket from a dead process.
  The Linux microphone-activity detector spawns it; its child does not appear to
  close inherited fds.
- **Idle RSS is ~1 GB** across the process tree, and the ~17 % idle CPU floor is
  the same on every surface. Neither is a rendering problem; both are the next
  thing worth measuring after the field work above.
