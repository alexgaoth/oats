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

### P1.5 Create one shared Conversation Signal Rail — NOT DONE, needs a decision

Question cards are still a separate always-on-top `BrowserWindow` with their own
renderer route and IPC synchronisation, so the signature feature still reads as
an overlay widget rather than part of the Conversation surface.

This is the largest remaining item and the only one that changes main-process
window management. It should not be landed without a live session with real
speech, because getting it wrong breaks the product's signature feature. The
open design questions are: what the docked rail looks like collapsed, whether
the overlay and the dock can ever be on screen simultaneously, and what happens
to a card's dismissal/undo timer when the host swaps mid-conversation.

**Evidence:** `src/helpers/windowManager.js:1523-1575`,
`src/components/ConversationAssistOverlay.tsx:243-352`, `CLAUDE.md:31`.

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

- **Still open: the inventory.** Every renderer surface classified as Oats
  primary / Advanced only / compatibility-only / delete, and the inherited
  enterprise and SaaS configuration deleted or isolated rather than themed over.
  Keep the three-surface architecture; do not add a fourth shell to accommodate
  legacy features.

## P2 — make the product useful every day for high-signal people

Not started. These are product builds, not fixes, and each wants a decision
before code.

### P2.1 Build source-linked local recall

Ask across conversations in natural language; return local semantic results with
source excerpts that jump to the transcript moment and distinguish exact wording
from inferred summary. The present Intelligence search is lowercased substring
matching that only appears above four conversations.

**Evidence:** `src/components/OatsWorkspace.tsx` — the `query`/`visibleNotes`
filter and the `notes.length > 4` gate.

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

- **Pre-existing dead key:** `oats.settings.noShortcut` is unused in all 10
  locale files.
- **A killed Oats can leave a `pactl subscribe` child holding inherited file
  descriptors** — it was found holding a listening socket from a dead process.
  The Linux microphone-activity detector spawns it; its child does not appear to
  close inherited fds.
- **Idle RSS is ~1 GB** across the process tree, and the ~17 % idle CPU floor is
  the same on every surface. Neither is a rendering problem; both are the next
  thing worth measuring after the field work above.
