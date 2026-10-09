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
surface with **no conversation running** cost **113 % of a core**. Freezing the
field took that to 17 %, and removing an infinite CSS animation from the floating
oat took it to **0.3 %** (2026-08-24). The 17 % figure does not reproduce even on
the commit it was recorded from. See "P0.1" and "Idle cost" below.

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
idle CPU is flat across all three surfaces (17.1 / 18.1 / 16.7 % when this was
written; **0.3 / 1.7 / 0.6 %** since 2026-08-24, and the 17 % figure does not
reproduce even on its own commit — see the idle-cost section below). Against
that,
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

**Decided 2026-08-24 and shipped:** `related` results stay when the literal filter
found nothing — that is the case semantic recall exists for — and the page says
so first rather than implying a match it does not have. The `role="status"`
announcement counts _literal_ matches only, with any guesses named separately,
because counting them together told a screen-reader user that three conversations
matched when one did.

**Done 2026-10-08: a search reaches every conversation, and what was said in
it.** Three holes, each measured before it was closed:

- `notes_fts` never indexed a transcript — a conversation's `content` is always
  "" — so the keyword search and the hybrid FTS + vector search could not find
  a word anybody said. It is now contentless (`contentless_delete=1`) over
  title, content, summary, the transcript's words and mark notes, built once by
  a guarded migration. That also ends the every-launch backfill, which re-added
  every note to the old index and left it failing FTS5's integrity-check.
- The list filters only the hundred conversations it holds, so nothing older
  could be found. `db-recall-notes` runs the same literal test (`recallText`)
  over the rest in the main process and returns only the matches.
- The filter folded the raw transcript JSON, so a key name matched everything.

Measured in the renderer (Vite, headless Chrome, 110 conversations):
`"dolphin protocol"`, said only in the 104th, went from `Nothing matches that`
to one `said · 1:00:` row that opens on that turn; `speakerStatus` went from 100
rows to none. A result the list did not hold opened the newest conversation in
its place (measured: `Conversation 0`); it opens itself now.

**Still open:** the vector index embeds the title and summary only, cut at 1500
characters (`LocalEmbeddings.noteEmbedText`), so `related` knows nothing of what
was said. Transcript chunks want their own collection, like
`conversation_chunks`, embedded after Finish rather than on every checkpoint.

### P2.2 Post-conversation review — the certain half done (2026-08-23)

**Done: open and researched questions, with links to the exact utterance.** The
reading view opened on the summary — prose from a local 1.5B model CLAUDE.md is
explicit "frequently does not" succeed — and that was the first and only thing
you saw, while Oats was already holding facts it knows exactly and showing none
of them. `helpers/conversationReview.mjs` (pure, 9 pins) reports what nobody
answered, how each one came out, which ones Oats went and searched, and which
threads were left open. It renders **above** the summary: an evidence tool that
leads with a model's prose is asking you to trust the weakest thing on the page.

Each unresolved question is a place, not a sentence — pressing it opens the
transcript at the turn it was asked in. Measured: heading "What this left open",
one item for the denied question and none for the answered one, tally
`2 asked, 1 answered`, `reviewAboveSummary: true`, and pressing the item lands on
the Transcript tab with that turn inked and on screen.

**Deliberately not done: decisions, commitments and owners.** Detecting those
means pattern-matching intent, and this product's posture on inference is set by
the question rules — local patterns first, the model only refining, a false
positive treated as expensive. A commitment Oats invented and attributed to
somebody in the room is exactly that kind of expensive. It wants its own pass,
with both-direction pins the way `conversationAide` has, and probably its own
critic loop.

**Also still open:** "what changed since the last related conversation" — the
`carriedOver` line already names what the previous conversation on this subject
left open, but it does not say what _this_ one closed.

### P2.3 Evaluate local people/project memory after recall works

Only after P2.1 is accurate. A lightweight memory aid, not a CRM.

### P2.4 Problem-only trust/health surface — the checkpoint done (2026-08-23)

**Done: a failing checkpoint is loud.** Checkpointing already bounded what a
crash could take — every finalized utterance schedules a debounced write — but
the write was fired with `void` and its result discarded, so the _other_ failure
(database refusing, disk full, file locked) was completely silent. You would
record for an hour, press stop, and find out then. That is the exact shape the
product's own standard forbids, and it was the one case nothing watched.

The result is read now. `checkpointLastWritten` only advances on success, so a
failed write is retried by the next utterance instead of being assumed done, and
the store carries `checkpointFailedSince` / `checkpointedSegments` /
`lastCheckpointAt`. `helpers/recordingHealth.mjs` (pure, 6 pins) decides when
that is worth saying: never while healthy, and not on a single refused write —
one failure during a database checkpoint is not news, and a warning that cries
wolf is one people learn to ignore before the real one arrives.

Measured in the built renderer, four states: healthy → silent; failed 3s ago →
silent; failing 40s with 4 unsaved turns → `The last 4 turns have not been
saved. Check disk space, then finish and reopen the conversation.`, on screen in
the pinned foot **and** in the `role="status"` region; failing but nothing
unsaved → silent. It says how much is at risk because "saving failed" is a
status and "the last four turns are not saved" is something a person can act on.

**Done: a stalled transcription backend is loud too.** That was the gap the
dead-microphone warning cannot cover — it watches the _audio level_, and muted,
unplugged or taken-by-another-app all read as a flat floor. But a Whisper server
that died, a model that failed to load, or a sidecar that was reaped leaves the
level perfectly healthy and produces nothing: the pulse breathes, the clock runs,
and the transcript stays empty until you press stop.

`transcriptionStalled()` reports sustained sound with no finalized turn. The
grace period is **90s**, far beyond the ~5s local chunk interval, because the
false positive here is expensive in a specific way: a fan or an air-conditioner
sits above the silence floor all meeting, and telling somebody mid-conversation
that their recording is broken when it is not makes them stop it to check. Before
the first turn it measures against the recording's own start, so a backend that
never came up is caught on the first conversation rather than the last.

Measured, five states: talking-and-transcribed silent; nothing for 30s silent;
nothing for 2min loud, in the foot and the `role="status"` region; room-went-quiet
silent; dead microphone shows only the microphone warning — one problem, one
warning.

**Still open:** local model readiness _before_ a recording starts (the preflight
already checks some of this) and a network action other than auto-search, which
already announces itself on the card (`searched · google`).

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

## Dictation accuracy — measured and fixed (2026-08-24)

`docs/dictation-accuracy.md` and `scripts/asr-eval.js`. **38% fewer errors and
4.4× faster** than what shipped, for an English speaker who has set their
language: 7.74% WER / 1952ms median → **4.83% / 446ms** on LibriSpeech
test-clean. Read that as a floor — it is read speech in a quiet room.

Three changes, each measured with the app's own `buildWhisperServerArgs` so the
benchmark cannot drift from the product:

- **`--no-timestamps`, ported from upstream (#1348).** An accuracy bug, not a
  formatting preference: whisper.cpp v1.9.x enables a 60-character segment wrap
  that lands on token boundaries with `split_on_word` off, breaking words in
  half. Our own eval output had `overh anging` and `indisc reet`. 7.74% → 7.18%,
  1090ms → 584ms.
- **`base.en` bundled and selected automatically for English.** Same 148MB, and
  it spent none of its capacity on the other ninety-eight languages. 7.18% →
  4.83%, 584ms → 446ms. The registry had no `.en` entries at all. It is not
  offered in the picker — it is not a tier to weigh, it is the same tier with the
  dead weight removed — and it falls back silently when not on disk.
- **The `.en` family is in the registry** (`tiny/base/small/medium`), so larger
  English-only models are reachable at all now.

**Kept deliberately:** `preferredLanguage` still defaults to `"auto"`, which
needs the multilingual model and costs ~140ms and 2.4 points of WER. Guessing
English from the OS locale would be right most of the time and catastrophic when
wrong — a German speaker on an English laptop would get mangled dictation rather
than merely slow dictation. Slow is recoverable; wrong is not. Setting the
language in Settings is one click and is the highest-value thing a user can do.

**Still open:** the cloud row (`--cloud` exists; running it spends the key
owner's credits), upstream's `--device` GPU index, and ~3,000 lines of
divergence in upstream `audioManager.js`. The pre-Oats build feels different
because it defaults `useLocalWhisper` to **false** and transcribes in the cloud;
Oats keeps local on purpose, and local is now much closer.

## Backlog close-out (2026-08-24)

`.iterate/20260824-close-the-backlog/`. Five items, plus two defects the loop
turned up that nobody had logged.

- **Dead locale keys removed.** 2,296 → 1,435 per locale (ru 1,453: Russian's
  CLDR `_few`/`_many` are kept, and pruning them away was one of the two blockers
  this loop caught). Reachability is prefix-aware _and_ template-aware —
  ``t(`suggestions.${kind}`)`` anchors a namespace whose head is one segment,
  which a dotted-prefix rule cannot see. `scripts/prune-locale-keys.js`,
  `helpers/localeKeyUsage.mjs`, 12 pins.
- **`scripts/check-missing-keys.js` is part of `i18n:check`.** It asks i18next
  itself with `fallbackLng: false` — every literal `t()`, every runtime-built key
  expanded over the values the code produces, every `descriptionKey` the model
  registry names in JSON. `check-i18n.js` only compares locales against each
  other and is blind to a key missing from all ten; this found four, including
  `oats.intelligence.searchResults`, which the `aria-live` region had been
  announcing as a literal key string.
- **The gate ran a sixth of the suite.** `test:oats:core` was a hand-kept list of
  15 files; 79 helper tests and all of `test/utils` never ran. It is a glob now:
  **775 + 16 tests, 0 failures**, up from ~110.
- **`pactl` orphan.** The backlog's stated cause — inherited file descriptors —
  is false, measured by socket inodes in `/proc/<pid>/fd`; `detached` changes
  neither inheritance nor survival of `kill -9`. It is an orphan, and it is
  registered with `sidecarPidFile` / `sidecarReaper` now.
- **Model readiness before recording** was already implemented; the note was
  stale. Verified by driving the app in four states.
- **`related` results** stay when nothing literal matched — that is the case they
  exist for — and the announcement now uses the same three-way split as the
  markup instead of telling a screen-reader user about conversations that do not
  exist.

**Done: CI runs the gates (2026-08-24).** It ran only `npm test`, and that command
globbed `test/**` including the four tests needing Electron's better-sqlite3 ABI
— which `npm ci --ignore-scripts` never builds, so the single job CI ran was
**exiting 1**. `npm test` is the plain-node suite now, and the workflow has four
jobs: unit tests, both locale gates, `quality-check`, and the renderer build. The
locales job clones with `fetch-depth: 2` because `check-missing-keys.js` compares
each runtime-built subtree against the previous commit, and it degrades to
skipping that comparison outside a git checkout rather than failing.

**Done: the conversation-aide settings panel speaks ten languages.** It shipped
fifteen hardcoded English strings — the section a preflight warning now sends
people to. `oats.aide.*`, all ten locales.

**Still open — `--device` is ported but nothing sets it.** `buildWhisperServerArgs`
takes `gpuDeviceIndex` and is pinned both ways, but no caller supplies one: the
Settings GPU picker stores a **UUID** that becomes `CUDA_VISIBLE_DEVICES`. Wiring
it needs a Vulkan device enumeration mapped to ggml's _logical_ indices, which
diverge from physical ones whenever a device is filtered out — and it cannot be
verified on a machine with no GPU backend, which is what this work ran on.
Shipping an unverifiable GPU path is worse than shipping none.

## Idle cost — attributed, and the floor removed (2026-08-24)

`.iterate/20260824-idle-cost/`. The backlog said "idle RSS is ~1 GB … the ~17 %
idle CPU floor is the same on every surface … neither is a rendering problem."
Both halves were wrong, and both were wrong because the instrument reported one
number for a tree of thirteen processes.

- **The idle CPU was one CSS animation.** `.oats-listening-pulse::before`
  breathes on `infinite`, and `src/App.jsx` put that class in the floating oat's
  **base** class list — so the always-on-top window breathed in `idle` and
  `hover` too. With GPU compositing disabled on Linux every frame is read back on
  the CPU. Attributed per process: GPU 3.2 % + oat renderer 2.3 % of a 6.2 %
  total, in a window nobody is looking at. Fixed the way `ListeningPulse.tsx`
  already did it; idle CPU **6.2 / 8.2 / 6.5 % → 0.3 / 1.7 / 0.6 %**. `processing`
  keeps its breath on purpose — it is the only positive sign that window has that
  work is happening, and it is bounded by the transcription.
- It was also wrong on screen. `DESIGN.md` §9.1 says the seed breathes while a
  session is live and "Idle = static gold seed"; the oat claimed to be listening
  whenever the app was open, on the one window whose whole job is that
  distinction.
- **The 17.1 % does not reproduce on its own commit.** `933f7cb` was checked out,
  built and driven by the same instrument, and recorded as
  `docs/perf/fedora-2026-08-24-933f7cb.json`: **6.2 / 7.5 / 6.3 %**, with the
  same ~5.4 points of breath. Nothing between the two dates changed idle CPU; the older
  row is a property of that afternoon's machine, and is not comparable.
- **The instrument was reading a subset of the tree.** All four walks used
  `/proc/<pid>/task/<pid>/children`, which lists only the _main thread's_
  children — and Chromium forks renderers from a launcher thread. It reached 10
  of 13 processes, omitting the renderer drawing the surface being measured.
- **The ~1 GB was double counting.** Summed `VmRSS` counts every shared page once
  per process holding it. PSS, over the corrected walk: **670–805 MB**
  across the three recorded runs, of which 264–286 MB is `whisper-server` and Qdrant pre-warmed at launch — a stated trade
  for an instant first recording and first search, not a defect.
- **`pactl` does inherit the debug port's listening socket.** A pass earlier the
  same day removed that claim as measured-false; it is true, and there is now an
  inode to prove it (`/proc/<pactl>/fd/63 -> socket:[8511221]`, the inode `ss`
  reports LISTENing). `perf:baseline` clears the port itself before launching,
  because Chromium binds it before any application code can reap anything.
- **`perf:baseline` attributes idle cost per process**, naming Chromium's own via
  `SystemInfo.getProcessInfo`, the sidecars by walking `/proc`, and telling the
  two renderers apart by making one busy — a renderer forked from the zygote
  keeps the zygote's command line, so it cannot be identified from `/proc` alone.
- **The floating oat's main control had no accessible name**, while the two small
  buttons beside it did. It now uses `app.mic.hotkeyToSpeak` — a string that was
  translated into all ten locales and had no call site — so the name says what
  the key does rather than naming the key.
- **`findBrowserPid` was returning the node launcher**, not the browser — `/proc`
  enumerates in ascending pid order and the launcher carries the same
  `--remote-debugging-port` flag, so ~27 MB of harness counted as application,
  and once the scan returned a shell. The browser pid now comes from
  `SystemInfo.getProcessInfo`.
- **The oat's control named a status, not an action.** While recording, a screen
  reader said "Recording…" for a button that _stops and transcribes_; while
  processing it named a control that does nothing. Now `app.mic.recordingStop`
  (ten locales) and `aria-disabled` respectively.
- **Found, not fixed:** two measured defects on the oat, filed under "Noted in
  passing" below.
- **Intelligence's extra idle point is entry cost.** It idles at 1.7 % against
  0.3 %, but its own per-process rows sum to 0.6 % in the same run — the
  difference is that the attribution samples about five seconds later, by which
  time the on-entry contour drawing and transcript parsing have decayed.

## UI pass (2026-10-03)

Every surface driven in a headless Chrome over the real Vite renderer with a
stubbed bridge and conversations generated by the real topic tracker, both
colour modes, both interfaces. Everything below was found by looking, then
fixed and measured; none of it was found by reading.

**Honesty**

- **"Searched" meant "offered".** The review marked a question `searched`
  whenever a suggestion row existed — and every unanswered question gets one, at
  `shown`. A failed automatic search stays at `shown` too. It now means `opened`
  and nothing else; pinned both ways.
- **A finished conversation had a live topic.** The snapshot stored at stop
  marked the subject being spoken `live`, so the reading view drew it gold — a
  second accent beside the selected node (§9.4) — and `live` masked `resolved`.
  `snapshot({ final: true })` at stop; legacy records read `live` as `open`.

**The live surface**

- **A re-asked question sank below the fold.** Groups ordered by their first
  asking; ordered by their latest, the re-asking is at the top with its repeat
  nested. Spec updated (§9.2).
- **The live thread map** drew each dot half a label left of its x (connectors
  ended mid-word), let labels collide, filled every dot gold, and outlined a
  `settled` state the tracker never emits. Dots now sit on their points, labels
  are placed right/left/above/below and hidden only when nothing fits, and the
  marks speak §4. Pinned (`placeLabels`, 6 new tests). Spec added (§9.3).
- **Detailed's transcript had two lines** at the shipped 1200x800: 93px under
  80px of blank paper. 113px now, and 24px leading in both transcripts so a
  wrapped line no longer reads as a new turn.

**Reading**

- **Dates say when.** Every conversation of a day read `10/3/2026`. Time today,
  weekday this week, date this year, via `Intl` in the interface language; the
  head of a record says the full moment and how long it ran; each contour strip
  carries its length. `helpers/ledgerDate.mjs`, pinned.
- **List previews ran headings into prose** ("…closed. Threads Enterprise…").
- **The review tally read labels as part of the count**; the labels now go
  through the string, with each language's colon.
- **The topic graph ran off the window again** once a title wrapped: sized to
  the measured room below it now, not to a constant.
- **The lifetime map drew one-offs as its heaviest objects.** Holes were 2x2 in
  3x3 cells, so nothing could drop under 56% ink and `dropped` drew at ~69%.
  Full-cell holes on a canvas-locked lattice: open ~69%, dropped ~38% (§4).
- **Opening a search result scrolled the whole window** 8px and left the nav
  clipped until reload — `scrollIntoView` scrolls `overflow: hidden` ancestors.
  The root and panes are `overflow: clip`.

**The seam**

- **`font-mono` never applied to a button inside an Oats surface.** An
  unlayered `button { font-family }` rule — the trap `CLAUDE.md` documents for
  headings and inputs — was not scoped out of `.oats-surface`. Copy, Save,
  Delete, Back, Map, Change and the map's subjects render in mono as written.
- **Settings speaks one language.** The shortcut rows were the last inherited
  control on the visible page (bordered keycaps behind a redundant "Hotkey"):
  `HotkeyInput variant="ledger"` writes them as the Conversation screen does.
  Two gold rules rested on the page; chosen options are ink, like the nav and
  tabs. Heading off the band, one quiet style for both folder actions.
- **Field mode:** the scroll fades painted paper bars that cut the farmhouse;
  feathered at their ends now.

**The floating oat** — both entries formerly noted in passing below. Tooltips
wrap inside the 96px window and are nudged back inside it when anchored near an
edge (measured in en/de/fr/ru/ja, every state); during a conversation the tip is
the action, "Finish conversation". Past the hour the clock reads `1h05`.

Still open, and wanting a decision rather than a fix:

- **Settings still overflows by 42px** at 1200x800. Fitting it means cutting
  the auto-search sentence that says what leaves the device, or moving the
  Interface or vault row behind Advanced.
- **Detailed is crowded at the default size.** The thread map (176px with its
  quote line) and the stack share a foot capped at 34%; the transcript gets what
  is left. Folding the map into the expanded stack would give the transcript a
  paragraph — a change to the composition, not a fix.
- **Field mode, Detailed:** the thread map and the stack sit below the reading
  paper's circle, so their words are on wheat.
- **All ten locales load at startup** (the 998 kB `settingsStore` chunk is
  i18next plus 1.1 MB of translations and prompts). Lazy-loading languages would
  make startup async for most users; worth measuring before doing.

## Features for intellectual conversations (2026-10-03, second pass)

Each local, model-free, one action at most, and measured in the renderer rig;
the storage path also against real SQLite under Electron (`test:oats:db`).

- **Mark the moment** (`DESIGN.md` §9.10). **Mark** beside the clock, `M`, or
  the floating oat's clock (the only thing on screen when recording with the
  panel hidden — new IPC `mark-moment-request` → `mark-moment`). Saved to the
  note on the press (`notes.conversation_marks`), drawn as an ink caret under
  the contour, quoted first in the record with the words being said and a note
  that is added afterwards, marked in the transcript's margin, filed to the
  vault, written by **Save**, searchable as `your note`, counted in the list,
  removable. `helpers/conversationMoments.mjs`, pinned.
- **The contour is the way into a record**: a click opens the transcript at
  that moment; a hairline says when before the press.
- **The transcript has a margin**: each question's §4 state mark beside the turn
  it was asked in, the caret beside each marked turn.
- **The answers, one press away**: the review's "Show the answers" lists each
  answered question with the reply verbatim, which opens the turn.
- **Find in this conversation**: `/` or Ctrl/Cmd+F in a record — `n of m`,
  Enter/Shift+Enter, Escape closes. In the list `/` still searches
  conversations, and `Esc` steps back from a record or the map.

Still open:

- **Marking is never verified with a real microphone.** The press, the write,
  the IPC listener and the column are each measured; one live recording in the
  real app is not.
- **A mark resolves to the nearest utterance.** In a room a segment's
  timestamp is now when its speech began (recording start + the segmenter's
  `startMs`, 2026-10-04); on a call it is still when the ~5s chunk finalised.

## Transcription and speakers in a room (2026-10-04)

Asked: "OpenWhispr transcribes clearer" and "it should identify who is
speaking". Measured against a fresh clone of OpenWhispr 1.10.2; numbers and
method in `docs/dictation-accuracy.md`.

- **Clearer — done.** Locally the two apps are within a point of each other;
  OpenWhispr sounds clearer because it defaults to the cloud. What did differ
  was how a room was cut: fixed 5s chunks, mid-word. Pause-aligned segments
  (`helpers/speechSegmenter.mjs`) take conversation WER from 15.2% to 6.2%.
- **Who said it — done.** After Finish the recording is diarized once with
  TitaNet-small (bundled, 46MB) and each turn labelled _Speaker N_; one press
  names a voice for the whole conversation. 92% of turns right with the count
  guessed, against 38% for the CAM++ model both apps shipped. Upstream's
  phantom-cluster and collapse rules are ported.
- **Finish lost the end of every local conversation — fixed.** The renderer
  removed its listeners before main transcribed the audio it still held, and
  saved the note the moment recording turned off. With 5s chunks that is at
  most the last 5s (by reading the code, not measured); with pause segments it
  is up to 20s, and measured end-to-end under load it was **34s of a 72s
  conversation**. Stop now releases capture, waits for main, then cleans up;
  the save waits on `isTranscribing`, and Record waits for a Finish still
  landing. Measured after (2026-10-08, real app, fake microphone): kept to
  85.3s of 85.4s and 80.4s of 80.6s, conversation WER 7.2% and 3.1%, note
  saved 0.5s after Finish, speakers 4.6s after Finish on an idle CPU.
- **Stored segments had no ids — fixed.** Search landing and mark links
  silently missed on every real conversation.

Still open:

- **Not verified with a real microphone or real speech.** The end-to-end run
  feeds a LibriSpeech conversation through Chromium's fake capture device into
  the real app. Read speech, no crosstalk, no room. In those runs: two voices
  attributed 100%; three voices 89%, one person split into two speakers for
  their first two turns. Naming both the same joins them on screen.
- **Long conversations are unmeasured.** The longest test is 137s. The speaker
  pass runs after Finish and scales with length, and upstream saw CAM++
  clusters drift apart over an hour; whether TitaNet at 0.85 holds is unknown.
- **TitaNet-small is trained on English.** Other languages are untested.
- **Speakers are known only after Finish**, so the live dialogue in a room has
  no labels. Live diarization is a different product decision.

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

- ~~**`docs/network-allowlist.md` is wrong about launch.**~~ Fixed 2026-10-08: a
  packaged build fetches nothing at launch (CAM++ and Silero serve only the call
  path; MiniLM is bundled on every platform; the bundled pyannote is no longer
  re-downloaded), and Qdrant's telemetry is off. Pinned in
  `test/helpers/networkBoundary.test.js`.
