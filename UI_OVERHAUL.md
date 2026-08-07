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

### Not done at the time — now closed, see the pass below

**§8's "the outgoing view dims to 0 as the incoming rises" was unmet.** It was an
enter-only fade. Two attempts at a true cross-fade were both verifiably wrong:
re-rendering the previous element _mounts a fresh copy_ (which replays the enter
animation under a fading wrapper, and re-runs every mount effect of the view
being left), and cloning the DOM in a `useLayoutEffect` captures the _incoming_
view because React has already committed by then. Both looked worse than the
plain fade. `CrossFade.tsx` was deleted rather than shipped broken.

Both failures share a cause — they produce a **second instance** of the view being
left. The answer turned out to be to stop creating one: see "the surfaces stopped
unmounting" below.

### Open minors from the final round — all closed

- ~~`ForceGraph.draw()` calls `getComputedStyle` and reassigns canvas size every
  frame, now ~73× per settle.~~
- ~~The settle undoes ~74% of a drag's displacement, which reads as
  rubber-banding rather than settling.~~
- ~~The running tick captures a stale `draw`, so hovering during a settle has its
  highlight overwritten each frame.~~
- ~~`viewKey` uses `reading` while the branch requires `reading && selected`.~~
  Already resolved when it was written down: each Intelligence branch carries a
  literal key on the element it returns, so the key cannot disagree with the
  condition that produced it. The note was stale, not the code.

---

## Mac-first pass (2026-07-31)

Two rounds, builder/critic; audit trail in
`.iterate/20260731-mac-and-open-items/`. Closes every item above and audits the
overhaul for defects that are conditional on the platform — the app is developed
on Linux under software compositing and will mostly be run on macOS, so a thing
can be correct here and wrong there.

### The surfaces stopped unmounting

All three surfaces are now mounted at once and stacked; the active one is
`data-active="true"` and the others carry `inert` and `pointer-events: none`.
Switching cross-fades them. Sampling opacity every 30ms across a switch:

| t (ms) | outgoing | incoming |
| ------ | -------- | -------- |
| 60     | 1.000    | 0.000    |
| 90     | 0.528    | 0.472    |
| 150    | 0.183    | 0.817    |
| 210    | 0.010    | 0.990    |
| 240    | 0.000    | 1.000    |

Four frames of genuine overlap. That is §8 met, for the first time.

It also fixed a functional bug nobody had noticed. `ConversationSurface` is the
only registrant of `onToggleConversation`, so while it was unmounted **the global
conversation hotkey did nothing on Intelligence and Settings** — the primary
action, documented as working "from anywhere", worked on one screen in three.

Fixing that opened a second hole, which a review caught: the hotkey now worked from
Settings, but you stayed on Settings. Recording began with no pulse, no timer and
no stop control on screen, and the nav faded out (A7) half a second later and
stopped taking clicks — so the only way to stop was a shortcut you could no longer
see. **A conversation starting now brings the Conversation surface with it**,
watching the store rather than the hotkey so every route in is covered.

A surface's *contents* still wait for its first visit. Mounting Settings at launch
meant `MicrophoneSettings` enumerating devices at startup, and on a machine whose
mic permission has been reset that is an OS permission prompt plus a live
`getUserMedia` on the Conversation screen, unexplained — and on macOS it pauses
whatever is playing. The pane element mounts immediately (the cross-fade needs a
committed `opacity: 0` to move away from); the subtree waits.

### Every transition in the app was resolving to `0s`

The worst thing found, and invisible in the source. The motion tokens carried
their easing (`--motion-base: 220ms cubic-bezier(…)`), but are used almost
entirely through Tailwind as `[transition-duration:var(--motion-base)]` — and
`transition-duration: 220ms cubic-bezier(…)` is not a valid duration, so it fell
back to `0s`. The nav underline slide, the nav fade while recording, every hover,
the open-thread stack and the assist overlay had never animated. Only asking the
running app for its computed `transition-duration` showed it.

The tokens are durations now, `--ease-oats` carries the curve, and Tailwind's
`--default-transition-timing-function` / `--default-transition-duration` point at
them so a bare `transition-colors` is already on the Oats curve.

### F2 was reported done and was not done

`index.css` has an inherited `input:not(.input-inline)` rule giving every input a
border, a radius and a filled background. It is an *element* selector, so it
outranks the utilities a component sets on itself: `border-b bg-transparent` lost
and the box came back. The Oats inputs now use that rule's own `.input-inline`
opt-out. Measured before: 1px border, 8px radius, filled. After: bottom hairline,
no radius, transparent.

### The drag band was eating clicks

H4's drag strip was absolutely positioned over the top of the composition, and
`-webkit-app-region: drag` swallows clicks — so every Intelligence row that
scrolled under it stopped being clickable. It is real layout now. That also gives
the macOS traffic lights (y 20–34, per `windowConfig.js`) a band to themselves;
they were sitting six pixels above the Intelligence heading.

### The graph

Palette read on mount and on theme change instead of per frame (measured: **0**
`getComputedStyle` calls across a full drag and settle, down from ~73); backing
store reallocated only on a real size change; DPR clamped to 2 like the field,
which is a 4× difference on a Retina Mac. The dragged node stays pinned **through**
the release settle, so a 227px drag now ends exactly where it was dropped
(measured `undonePx: 0`) while neighbours still give way (18, 52, 36px).

One correction to the record: the "~74%" above was not reproduced. On a synthetic
five-node star, unpinning at let-go costs about 40px of a 233px drag — ~17%. The
direction is right and the fix is exact either way, but the magnitude above should
be read as measured on one real conversation, not as a constant. The
simulation moved to `notes/graphPhysics.ts`, pure and DOM-free like
`field/fieldModel.ts`, so those claims are unit-testable.

### macOS-conditional, fixed but **not verified on a Mac**

No Mac was available. These rest on documented platform behaviour plus tests that
exercise both branches from Linux, and should be confirmed on real hardware:

- **Overlay scrollbars.** Styling `::-webkit-scrollbar` with a width opts an
  element out of macOS overlay scrollbars and gives it a classic gutter that takes
  layout space. The rule was global, so on macOS it added a permanent 6px gutter,
  and because the reading views are `mx-auto` inside a scroll container the gutter
  appearing and disappearing shifted centred text 3px sideways. Now gated behind
  `html:not([data-platform="darwin"])`.
- **Traffic-light clearance** above.

---

## The question card (2026-07-31)

§9.2 — "the help moment, and the thing the product is judged on" — had never been
touched by any pass. It has now been rebuilt against the spec and looked at in
both colour modes.

### Repeats nest instead of collapsing into a tally

The old card rendered **one** body per question with an "asked 3×" count, and
argued for it in a comment: "a repeat does not get its own card body". Both
DESIGN.md §9.2 and CLAUDE.md's third question rule say the opposite, in terms —
each asking gets its own card, nested under the first, indented, hairline-linked,
at 70% ink; density is a rendering problem and never a reason to drop a detection.

The tally reads tidier and throws away the whole signal. A rephrasing — "have you
used kubernetes?" then "are you familiar with k8s?" then "so you've never run a
cluster?" — is three different sets of words with three different outcomes, and
collapsing them to "asked 3×" erases exactly what Oats exists to catch. Every
asking is now on screen, verbatim, with its own state mark, age and action.

### The state marks were invisible

`.oats-dither` paints dots in `currentColor`; the mark also set
`background-color: currentColor`. Dots the same colour as the thing behind them —
so every mark rendered solid and §4's uncertainty encoding did nothing at all.
Dithered marks now paint dots over nothing, and use a 2px grid rather than 4px so
an 8px dot reads as texture instead of as two stray pixels.

### The search action stopped being gold

§9.2 asks for "a single gold action". That is right for one card and wrong for the
four the rail actually holds: stacked, it is four accents (§3) and it puts the
rail's whole visual weight on a secondary action instead of on the questions.
It is ink at rest and gold on hover/focus — still the one moment gold earns
something, and the rail's only colour at rest is now the state marks.

Deliberate deviation from the letter of §9.2, for the rule that outranks
everything else: this panel floats over a live conversation and nothing on it may
compete with the person in the room.

### The card names where the search went

`searched · google`, per §9.2, derived from the URL and never hard-coded — and
from the **card's own** `searchBaseUrl` rather than the current setting, so
changing engine later cannot rewrite the history of a question that already left.
`searchHostLabel` lives in `src/utils/searchHost.ts` with tests.

Also: the 24ms enter stagger, the 1px dithered edge, and a lowercase voice
throughout.

---

## Verified: the primary action works on shipped defaults (2026-07-31)

Never previously confirmed. Cleared this profile's transcription settings back to
the defaults, reloaded, and pressed record:

```
Meeting transcription started   totalMs: 221
Transcription mode: SERVER      model: base, language: auto
whisper-server started          ggml-base.bin, cuda: false, vulkan: false
Meeting transcription stopped
```

Recording reaches the bundled local model with no network, no API key and no
download — the pencil test's reliability clause, demonstrated rather than assumed.
The live subtitle reads "audio and transcripts stay on this device."

The earlier "OpenAI realtime requires a bring-your-own-key API key" was this dev
profile having been switched to cloud in an old session, not the defaults.

### The classifier is no longer required (fixed)

Starting the aide used to demand a downloaded 1.5B model, which contradicted the
two rules the card is built on — detection is local pattern matching with no model
round-trip, and the local reading of the reply is the *primary* verdict the model
may only refine (CLAUDE.md, first and fourth question rules) — and failed the
pencil test outright: the surface DESIGN.md calls "the thing the product is judged
on" did nothing on a machine with no model, no network and no account.

Almost none of the work was new. `_resolveLocally` already did the whole job, and
`_evaluate` already fell back to it when the classifier threw or returned
nonsense. Two changes: the gate stopped requiring a model, and `classify: null`
now routes straight to the local path instead of through the failure path — which
worked, but reported `classifier_failed` once per question for a model the user
never asked for, a diagnostic that means the opposite of what it says.

Four tests in `conversationAide.test.js` cover the no-classifier session
end to end: a card appears from local detection, a denial opens the search, an
answer does not, repeats are not suppressed, and no diagnostics are emitted (which
is what distinguishes this path from the failure path, and stops the tests passing
for the wrong reason).

### One finding that is still a decision

**The question card is off by default.** `conversationAideEnabled` defaults to
`false`, and with the model requirement gone that switch is now the *only* thing
between a user and the card.

Left alone deliberately. Turning it on means putting an always-on-top window over
every conversation, and its switch lives in the Advanced page — so a user who
wanted it off would have no visible way to say so. If it is to be on by default it
needs a control on the visible Settings page first, and that is a product call.

Note the docs currently assume it runs: auto-search is specified as "one Settings
toggle, default on", which is only meaningful if something is detecting questions.

### Still open

- The field runs a continuous rAF loop on every surface (~21fps here) including
  the reading surfaces where it sits at `intensity` 0.3. By design (§9.8, B4), but
  it is a permanent draw on a laptop battery, which matters more on macOS.
- Graph labels: the radius threshold that suppressed them now lifts below nine
  nodes, so a four-topic conversation no longer renders anonymous discs. Denser
  graphs keep the old rule.
- The resume offer now works on a fresh launch — the conversation list is loaded
  in `useAppBootstrap` rather than by whichever surface happened to want it first.
