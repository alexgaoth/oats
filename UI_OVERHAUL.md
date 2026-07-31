# UI overhaul — the horizon pass (2026-07-30)

Tracking document for the visual overhaul. Working doc: tick items as they land,
record what was actually decided, and note anything deliberately not done.

## The thesis

**The horizon is the app's permanent ground plane.** Sky above, field below, every
surface sitting in that world.

Before this pass the field was a recording decoration — it appeared for a few
seconds when you pressed record and the rest of the time the app was blank cream
paper with a sidebar. Inverting that gives the product a place to live, and it is
what justifies removing the left rail: a ground plane needs the full window width,
and a vertical rule at 208px cuts it in half.

Grounded in the subject per the `frontend-design` skill: Oats' world is oats,
paper, grain, dither, and the horizon. The boldness is spent in exactly one place
— **a single low sun above the horizon** (§B3). Everything else stays quiet.

## Binding constraints

These come from `DESIGN.md` and are not negotiable inside this pass:

- One accent. If two things on screen are gold, one is wrong (§3).
- One heading, one primary action, one content region per surface. A third region
  means it is two screens (§1).
- One animated dither layer, ever (§7).
- Only `transform` and `opacity` animate in a loop (§8).
- The field never competes with a word on screen, and never exceeds ~50% alpha (§9.8).
- Both colour modes and a `prefers-reduced-motion` path are first-class (§12).

---

## A. Layout and navigation

- [x] A1 Delete the left sidebar
- [x] A2 Nav moves to bottom-centre, on the horizon line
- [x] A3 All content optically centred in the true window centre
- [x] A4 Hero sits on the upper-third line, not dead centre
- [x] A5 Intelligence becomes two screens (list, then reading view)
- [x] A6 `Map` becomes full-bleed rather than a toggle inside a column
- [x] A7 Nav fades out entirely while recording

## B. The field becomes a world

- [x] B1 Sky — dithered vertical gradient
- [x] B2 Horizon line — 1px husk hairline, dithered to fade at the edges
- [x] B3 One low sun, off-centre on a thirds line **(the one bold move)**
- [x] B4 Drifting chaff riding the gust field, parallaxed by band
- [x] B5 Idle shows sky + horizon + bare ground; recording grows the wheat
- [x] B6 Rename `WheatField` → `Field`

## C. Typography

- [x] C1 Lowercase the display heroes
- [x] C2 Display tracking to −0.03em
- [x] C3 All machine state in mono (listening, timestamps, shortcuts, transcript)
- [x] C4 Kill the all-caps letterspaced `CONVERSATIONS` eyebrow

## D. Accent discipline

- [x] D1 Settings shows two golds at once — toggles become ink-on / husk-off

## E. The pulse

- [x] E1 Move the pulse into the field canvas (shared Bayer pass, §7 compliance)
- [x] E2 The record button becomes the seed, which becomes the pulse

## F. Chrome removal

- [x] F1 Search box → inline filter, not a permanent bordered input
- [x] F2 Inputs lose their boxes → bottom hairline, gold on focus
- [x] F3 Dividers capped at 40% opacity
- [x] F4 Tabs → quiet text links

## G. Empty states (DESIGN §9.5, currently unbuilt)

- [x] G1 Dithered horizon + one line of mono husk copy + one gentle action
- [x] G2 Teach the shortcut — `⌃⇧O to start`

## H. Quality floor

- [x] H1 Visible gold `:focus-visible` ring on everything interactive
- [x] H2 `prefers-reduced-motion` path for sun, chaff, and sky
- [x] H3 Radius audit against §6
- [x] H4 Frameless window still has a drag region after the sidebar goes

## Cut deliberately

- **Nav icons.** Mic / Brain / Gear were generic glyphs doing no work beside three
  unambiguous words. §10 prefers a word over an icon where space allows.

---

## Verification

Every item: `npm run verify:oats` equivalent (node --test, eslint, tsc, prettier,
renderer build), plus a real render in both colour modes. Nothing here ships on
reasoning alone — every real defect in the field was found by screenshotting it.

## Log

_(newest last)_

**2026-07-30 — the pass landed.** All 30 items done. Notes on what actually
happened, especially where it diverged from the plan:

- **The sun was wrong twice before it was right.** Planned as a discrete low sun
  (B3, "the one bold move"). First attempt drew a gold disc: on oat-milk paper
  gold is _darker_ than the background, so it rendered as a dark smudge with
  dither rings — a stain, not a light. Second attempt mixed the sun toward the
  raised surface to make it lighter; on near-white paper it became invisible.
  The resolution is that **light on paper is a wash, not a disc** — the horizon
  glow is now weighted horizontally around `SUN_X`, so the light has a direction
  and an origin without its source ever being drawn. The same term reads as a
  genuine glow in Steel-cut, where gold is brighter than charcoal. A single
  `warmScale` (0.5 light / 1.0 dark) carries the difference.
- **The world needed a volume control.** At full strength the horizon line drew
  straight through the Settings copy, which breaks §9.8's "never competes with a
  word". `Field` now takes `intensity`: 1 on Conversation, 0.3 on the reading
  surfaces. Blades and chaff are suppressed below 0.3 entirely.
- **`.oats-seed` fought its own size utilities.** The class sets width/height, so
  same-specificity Tailwind sizing did not reliably win. Added an explicit
  `.oats-seed--lg` modifier rather than escalating specificity.
- **The window could not be moved.** Not caused by this pass — `TitleBar` is only
  mounted in onboarding, so the frameless control panel never had a drag region
  once the old shell died. The now-empty top of the composition is an invisible
  36px drag strip (H4).
- **Nav highlight was not a bug.** The earlier screenshot showing the highlight
  one item behind the content was a stale-frame artifact of `capturePage` under
  this machine's software compositing. Verified by reading DOM state instead of
  pixels: `activeIndex` matched the clicked index every time. Captures now
  discard a first frame and settle longer.

Renames: `WheatField` → `Field`, `wheatField/` → `field/`,
`WheatFieldGL` → `FieldGL`, `WheatFieldCanvas` → `FieldCanvas`,
`test/helpers/wheatFieldModel.test.js` → `fieldModel.test.js`.

New: `src/utils/hotkeyLabel.ts` (+ tests) so the idle screen and the empty state
can teach the shortcut in each platform's own convention.

## Verification pass — real app, real data (2026-07-30)

Ran against the actual Electron app over CDP with three seeded conversations,
because the Vite harness cannot show any of this. Everything below was found by
looking, not by reasoning.

### Bugs found and fixed

- **`seed:sample` wrote to a database the app never opens.** Two independent path
  mismatches: `main.js` isolates userData to `Oats-<channel>` while the script
  used the default, _and_ `database.js` picks the filename off `NODE_ENV`
  (`transcriptions-dev.db`) while the script left it unset. The script's own
  docstring claimed it opened "the same database the app itself opens". Its
  instructions could never have worked in dev. Both fixed.
- **Summaries rendered raw markdown.** `**Enterprise pricing**` appeared with
  literal asterisks on the one payload Intelligence exists to show. Now goes
  through `MarkdownRenderer`; list previews strip the syntax instead.
- **Topic-graph labels collided and clipped.** The solver only kept the _disc_
  inside the canvas, so a centred mono label ran off the edge. Layout now
  reserves label clearance, labels that would land on another node are dropped
  (hover and selection still force them), and long labels truncate with an
  ellipsis rather than being condensed into illegibility by `fillText`'s
  maxWidth.
- **Graphs parked in a corner of their container.** Added `fitToCanvas`, which
  centres and modestly scales the settled constellation while preserving relative
  positions — so a hand-dragged arrangement survives.
- **Both graphs sat in bordered boxes beside a permanent "select a…" column.**
  That is a third region holding an instruction. Boxes gone, panel appears only
  on selection, and the lifetime graph now matches the topic graph exactly as
  §9.7 requires.
- **A privacy overstatement shipped in the recording state.** The live subtitle
  read "Everything stays on this computer." — the forbidden claim in different
  words, since auto-search sends question text to the search host. Corrected to
  "audio and transcripts stay on this device." in all 10 locales. Only visible
  because the recording state was finally rendered.

### Still open, outside this pass

- **Recording fails with "OpenAI realtime requires a bring-your-own-key API
  key"** even though Settings shows "On this computer" selected. The processing
  choice does not appear to drive meeting transcription. This is a functional
  bug, not a UI one, and it blocks recording on a fresh install — worth treating
  as the next priority.
- The recording _visuals_ were verified by forcing the store state; the audio
  path itself was not, because of the above.

## Settings pass (2026-07-30)

The page was a stack of label → hint → control, three lines deep per setting,
with two filled slabs for the processing choice and two more for auto-search. It
read as a form to fill in rather than a page to glance at, and it did not come
close to §13's "fits on one screen".

- **Rows sit on a two-column spine.** Label and its explanation on the left, the
  control on the right. Roughly halves the page height and gives the eye
  something to follow. The hint lives in the _label's_ cell — a first attempt put
  it on a second grid row, where it landed under the control and read as an
  orphan belonging to whatever came next.
- **The processing choice speaks the nav's language** — a word with a gold rule
  under the live one. Two filled slabs made the most consequential setting also
  the loudest object on the page, and put a second gold beside the toggle.
- **Auto-search is a toggle.** It is a boolean sitting directly below another
  boolean that already used one; rendering it as two slabs made it look like a
  bigger decision than it is.
- **Every control is now a line.** The select, both hotkey inputs, and the API
  key field share one treatment: a hairline that goes gold only while focused or
  capturing. `HotkeyInput` has two variants and Settings uses the second — fixing
  only the first changed nothing on screen, which is why the first attempt
  looked like it had not applied.
- **The microphone status stopped being a status banner.** It was a
  `bg-success`-tinted panel; §4 is explicit that sage is a _state mark_ and never
  chrome, text, or emphasis. Now plain husk text. The genuine problem case
  (no built-in mic found) keeps terracotta, still without a panel.
- **`dictationHint` went from 37 words to 10.** The Linux Fn keyboard-firmware
  explanation is troubleshooting, not a description of a setting, on a page whose
  heading is "keep the choices small". `autoSearchHint` stays long on purpose —
  §11 requires saying exactly what leaves the device.
- **Data folder is a link, not a button.** Opening a folder is a side errand.

Verified in both colour modes.

## Iterate loop — motion, graph physics, colour (2026-07-30)

Three rounds, builder/critic, capped at 3. Final verdict **REVISE**; audit trail
in `.iterate/`. Findings: round 1 → 2 blockers + 9 majors; round 2 → 2 blockers

- 4 majors; round 3 → 1 blocker + 4 majors. Every blocker and major was fixed
  except the one below.

### Landed

**Graph physics — the goal's centrepiece — is done and was verified by an
independent critic rendering it.** Dragging a node now wakes the solver and the
neighbours give way, then it stops: all 5 neighbours moved, 73 frames ran, and
zero further rAFs were scheduled afterwards. `simulationStep` is shared by the
initial solve and the settle so there is one physics, the held node is pinned
(contributes force, receives none), decay is delta-time based so 120Hz settles
in the same wall-clock time, centre gravity is scaled to 8% during a settle so a
hand-arranged map is not re-solved, `byId` is rebuilt per tick, and unmount
flushes the pending persist.

The blocker that made all of it dead code: the accessibility overlay's per-node
buttons were `pointer-events-auto` and sat exactly over each disc, so the canvas
never received `pointerdown` and dragging was impossible with a mouse. They are
`pointer-events-none` now and remain fully keyboard-operable.

**Colour** — gold reduced to one per surface (nav underline and reading tabs are
ink; `ConversationGraph`'s fallback list, the topic-aside search links, and the
`LifetimeGraph` open link no longer use it). Terracotta removed from body text
in three places. `HotkeyInput`'s conflict warning used `--color-warning`, which
is byte-identical to `--color-primary`, so it rendered as gold text beside the
gold processing rule. `Toast` and `.toast-surface` moved off raw palette
literals and are now first-class in both modes; the §9.2 question card's
hard-coded ink shadow is token-derived.

**Motion** — surfaces and the three Intelligence views are keyed, so each change
remounts and replays a fade + 8px rise on the `base` curve, with a
reduced-motion still equivalent. `pulse-glow` no longer animates `box-shadow` in
a loop (a §8 review-blocking defect), and Toast's horizontal slide is gone.

### Not done — stated plainly

**§8's "the outgoing view dims to 0 as the incoming rises" is unmet.** It is an
enter-only fade. Two attempts at a true cross-fade were both verifiably wrong:
re-rendering the previous element _mounts a fresh copy_ (which replays the enter
animation under a fading wrapper, and re-runs every mount effect of the view
being left), and cloning the DOM in a `useLayoutEffect` captures the _incoming_
view because React has already committed by then. Both looked worse than the
plain fade. `CrossFade.tsx` was deleted rather than shipped broken. A correct
implementation has to capture before commit — a render-phase clone guarded on a
key ref, or holding the previous subtree in a portal.

### Open minors from the final round

- `ForceGraph.draw()` calls `getComputedStyle` and reassigns canvas size every
  frame, now ~73× per settle. `CLAUDE.md` records this exact mistake as a
  hard-won wheat-field lesson; it should read the palette on mount and on theme
  change.
- The settle undoes ~74% of a drag's displacement, which reads as rubber-banding
  rather than settling.
- The running tick captures a stale `draw`, so hovering during a settle has its
  highlight overwritten each frame.
- `viewKey` uses `reading` while the branch requires `reading && selected`.
