# Oats — Design Language

**Product:** Oats · **Company:** arum · **Status:** v1 direction

> The interface should feel like the product does: a sharp, quiet person sitting
> next to you. Warm, tactile, unhurried, and private by default. Nothing shouts.
> The signature texture is **dithering** — the grain of an oat rendered in pixels.
>
> **Sleek is the bar.** Sleek here means _less surface, more air, and motion that
> never stutters_ — not gloss, not gradients, not chrome. Every screen should look
> like it was subtracted down to its last necessary element and then given room to
> breathe.

---

## 1. Ethos — five words that decide every call

1. **Quiet.** Default to silence. Motion is slow, color is muted, the UI never
   announces itself. Help appears on demand, then gets out of the way.
2. **Warm.** Oat-milk paper, roasted ink, toasted-gold signal. No cold blues, no
   pure white, no pure black. Everything is a little bit "off," like real paper.
3. **Tactile.** Ordered dithering gives surfaces grain — the sense of a physical,
   local object you own, not a cloud tab.
4. **High-signal.** One accent. One idea per screen. Structure over walls of text.
   If a pixel isn't carrying meaning, remove it.
5. **Honest.** The visual language reinforces the privacy claim: local, calm,
   nothing leaving the device. A dithered pulse, never a red "recording" light.

The north-star test for any screen: _would it survive being the only thing a
founder keeps open all day?_ If it adds noise, it fails.

**The sleekness budget.** A primary surface gets at most: one heading, one
primary action, and one region of content. No toolbars, no breadcrumb, no status
bar, no card borders where whitespace would separate just as well, no visible
scrollbar chrome, no more than two typographic weights in view. Chrome is the
enemy; air is the feature. If a screen needs a third region, it is two screens.

---

## 2. Logo & wordmark

- **Wordmark:** `oats` — always lowercase, set in the display sans, tight tracking
  (`-0.02em`). Never capitalized, never "Oats" in the mark itself (prose may
  capitalize the product name).
- **Company lockup:** `oats · by arum` — the `· by arum` is muted-ink, small,
  set beside or beneath the wordmark. arum is the whisper, oats is the voice.
- **Symbol:** a single **husked oat grain** — an almond-form seed with one seam,
  rendered as a dithered fill (see §7). At small sizes it collapses to a solid
  toasted-gold seed. It doubles as the app icon and the tray/menubar mark.
- **The listening state IS branding:** when a session is live, the seed _breathes_
  (§9). That calm dithered pulse is the most recognizable thing about Oats.

Clearspace = the height of the seed on all sides. Never place the mark on a busy
photo; place it on paper (`surface-0`) or ink.

---

## 3. Color

Warm, low-chroma, single accent. Two modes: **Oat milk** (light) and **Steel-cut**
(dark). Values below map 1:1 onto the existing Tailwind v4 `@theme` tokens in
`src/index.css` — this _replaces_ OpenWhispr's blue/violet palette.

### Oat milk (light)

| Token                                      | Value     | Role                               |
| ------------------------------------------ | --------- | ---------------------------------- |
| `--color-background`                       | `#F6F1E7` | oat-milk paper — the base          |
| `--color-surface-0`                        | `#FBF7EF` | raised card / panel                |
| `--color-surface-1`                        | `#F1EBDD` | recessed / list rows               |
| `--color-surface-raised`                   | `#FFFDF8` | floating popover / the aide card   |
| `--color-foreground`                       | `#2B2620` | roasted ink — all body text        |
| `--color-muted-foreground`                 | `#6B6459` | husk — secondary text, timestamps  |
| `--color-border` / `--color-border-subtle` | `#E3D9C6` | hairlines, dividers                |
| `--color-border-hover`                     | `#D3C6AC` | hover edge                         |
| `--color-primary`                          | `#C67B27` | **toasted gold** — the one accent  |
| `--color-primary-foreground`               | `#FBF7EF` | text on accent                     |
| `--color-accent`                           | `#C67B27` | same as primary; there is only one |
| `--color-ring` / `--color-border-active`   | `#C67B27` | focus ring                         |

### Steel-cut (dark)

| Token                                | Value     | Role                  |
| ------------------------------------ | --------- | --------------------- |
| `--color-background`                 | `#201D18` | roasted charcoal      |
| `--color-surface-0`                  | `#2A261F` | raised card           |
| `--color-surface-raised`             | `#322D24` | popover / aide card   |
| `--color-foreground`                 | `#EDE6D6` | warm cream ink        |
| `--color-muted-foreground`           | `#A79E8C` | husk                  |
| `--color-border`                     | `#3B352B` | hairlines             |
| `--color-primary` / `--color-accent` | `#E0A34A` | brighter toasted gold |
| `--color-ring`                       | `#E0A34A` | focus ring            |

### Rules

- **One accent.** Toasted gold is the _only_ saturated color, and it is spent
  carefully: the live pulse, focus, the primary action, a selected node. If two
  things on screen are gold, one of them is wrong.
- **Text is ink, never accent.** Gold fails body-text contrast on paper by design
  — it is a _mark_ color (fills, dots, 1–2px strokes, large glyphs), not a reading
  color. Body text is always `foreground` / `muted-foreground`.
- **No pure `#FFF` / `#000`.** Everything carries warmth.

---

## 4. Semantic & state color — the shared state vocabulary

Four surfaces encode conversation structure — the question card (§9.2), the
open-thread stack (§9.3), the topic graph (§9.4), and the lifetime graph (§9.7).
They all speak **one** vocabulary. Outcomes get a color **and a dither density** (§7), so state is
legible in grayscale and for color-blind users — uncertainty literally looks
grainier.

### Question outcome

| State         | Light                | Dark      | Dither        | Meaning                                   |
| ------------- | -------------------- | --------- | ------------- | ----------------------------------------- |
| **Asked**     | `#6B6459` husk       | `#A79E8C` | sparse (~70%) | just detected; no verdict yet             |
| **Answered**  | `#7C8B6F` sage       | `#9FB08C` | solid (0%)    | question got a clean answer               |
| **Uncertain** | `#C67B27` gold       | `#E0A34A` | medium (~40%) | hedged / partial / "I think so"           |
| **Silence**   | `#6B6459` husk       | `#A79E8C` | sparse (~70%) | nothing came back; the room moved on      |
| **Denied**    | `#C05B3C` terracotta | `#D07350` | dense edge    | asked, and somebody said they didn't know |

`Asked` is the state every question enters at, within the same beat it is spoken.
It is deliberately the quietest — a card that has not yet been judged must not
look like an alarm.

**Denied is the only state that reaches the network on its own** (§9.2). It gets
the one alarming-adjacent colour in the palette for exactly that reason: it is the
state where Oats acted rather than merely recorded. Silence deliberately shares
husk with `Asked`, because nobody answering is an absence, not a verdict.

### Thread state (stack + graph)

| State        | Rendering                     | Meaning                                                     |
| ------------ | ----------------------------- | ----------------------------------------------------------- |
| **Live**     | gold ring, solid              | the thread being spoken right now                           |
| **Open**     | terracotta edge, dense dither | started, never resolved — the stack's whole reason to exist |
| **Resolved** | sage, solid, 60% ink          | reached a conclusion                                        |
| **Dropped**  | husk, sparse dither, 40% ink  | abandoned long enough to go cold                            |

Search interaction states use ink opacity, never new hues: `opened` gold
underline, `dismissed` 50%, `expired` 30% + strikethrough. Terracotta replaces
any hard red — warm, never alarming. There is still exactly one accent (§3):
sage and terracotta are _state marks_, never used for chrome, text, or emphasis.

---

## 5. Typography

Restraint is the whole point. Two families, a six-step scale.

- **Sans (UI + display):** keep the humanist stack already loaded — Noto Sans
  (`--font-family-sans`), `-apple-system` on macOS. The wordmark and headings use
  the same family at tight tracking; we do not add a display face.
- **Mono (signal):** transcripts, timestamps, question text in the Graph, model
  names, hotkeys. `ui-monospace, "SF Mono", "Commit Mono", monospace`. Mono is the
  "machine heard this" voice — it earns trust by looking verbatim.

| Step      | Size / line               | Use                            |
| --------- | ------------------------- | ------------------------------ |
| `display` | 40 / 44, tracking −0.02em | onboarding hero, empty states  |
| `title`   | 28 / 34                   | note title, section headers    |
| `heading` | 20 / 28                   | card titles, settings groups   |
| `body`    | 16 / 24                   | default reading                |
| `small`   | 14 / 20                   | secondary UI, labels           |
| `caption` | 12 / 16, mono             | timestamps, meta, signal chips |

Weights: 400 body, 500 UI emphasis, 600 headings. Never bold for color — use ink.
Measure caps at ~68ch for reading comfort.

---

## 6. Space, radius, elevation

- **Grid:** 4px base. Spacing scale `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
  Generous whitespace is the primary "premium" signal; when unsure, add space.
- **Radius:** keep it tight and physical, not bubbly.
  `--radius: 8px` (default, up from OpenWhispr's 6). Cards `12px`, the aide card
  `14px`, pills/chips fully round, inputs `8px`.
- **Elevation:** paper, not glass. Prefer a hairline `border` + a **1px dithered
  edge glow** over heavy shadows. When a shadow is needed it is warm and low:
  `0 1px 2px rgba(43,38,32,.06), 0 8px 24px rgba(43,38,32,.08)`. No blue-gray
  drop shadows, no glassmorphism blur.

---

## 7. Dithering & texture — the signature

Ordered (Bayer) dithering is Oats' fingerprint: the grain of an oat, the look of a
thing rendered locally on your own machine. Used with discipline it reads premium
and tactile; overused it reads noisy. **Texture is seasoning, not the meal.**

### The recipe

Ordered dithering thresholds a value against a tiling Bayer matrix. The 4×4 matrix
(values 0–15, divide by 16 for threshold):

```
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

**Implementation, in order of preference:**

1. **Static fills / illustration:** a small tiling Bayer PNG (8×8, 1-bit) used as a
   CSS `mask-image` over a two-stop gradient. The gradient supplies the color, the
   mask supplies the grain. Cheap, crisp at 1× and 2×, zero runtime cost.
2. **The live pulse / animated states:** a tiny canvas or WebGL fragment shader that
   thresholds an animated radial against the Bayer matrix. This is the _only_ place
   animated dither is worth the GPU — keep it to a small layer.
3. **Never** approximate dither with blurred noise or JPEG textures — it must be
   crisp, ordered, pixel-locked to the device, or it looks cheap instead of intentional.

### Where dither is allowed

- The husked-oat symbol fill, and the live listening pulse (§9.1).
- Full-bleed empty states and the onboarding hero (a dithered "oat field" horizon).
- State encoding on question cards, stack rows, and graph nodes (§4) — density =
  uncertainty. These are small marks, not surfaces.
- A 1px dithered edge on raised surfaces in place of a glow.

### Where dither is forbidden

- **Behind or inside any text.** Never. Text sits on flat `surface`.
- Dense data (settings forms, transcript bodies, long lists).
- More than **one dithered _surface_** visible at a time — a full-bleed hero or the
  pulse, never both. Small state marks (§4) are exempt and may repeat freely; they
  are the vocabulary, not the wallpaper.
- More than **one _animated_ dither layer**, ever (§8).

Grain is always in the accent or ink family at low contrast (≤8% against its base)
unless it is deliberately the hero of an empty state.

---

## 8. Motion

Smooth, slow, decelerating. Motion should feel like something settling, not
snapping. It exists to preserve continuity, never to entertain.

| Token              | Duration | Curve                    | Use                                     |
| ------------------ | -------- | ------------------------ | --------------------------------------- |
| `--motion-instant` | 120ms    | `cubic-bezier(.2,0,0,1)` | hover, focus, press                     |
| `--motion-base`    | 220ms    | `cubic-bezier(.2,0,0,1)` | cards in/out, view swaps, the aide card |
| `--motion-slow`    | 380ms    | `cubic-bezier(.2,0,0,1)` | onboarding steps, Graph reveal          |
| `--motion-ambient` | 2400ms   | `ease-in-out`, infinite  | the listening pulse breath              |

Patterns:

- **Enter:** fade + 8px rise (`base`). **Exit:** fade + 4px settle (`instant`).
- **View transitions** cross-fade; the outgoing view dims to 0 as the incoming
  rises. No horizontal slides, no bounce, no spring overshoot ever.
- **Stack expand/collapse:** height + opacity on `slow`, contents stagger 24ms.
  Never a slide-over; the stack grows in place from its collapsed rail (§9.3).
- **Graph reveal:** nodes settle in with a 30ms stagger along reading order.
- **Reduced motion:** honor `prefers-reduced-motion` — drop the pulse to a static
  dithered seed, freeze the graph at its solved layout, replace rises with instant
  opacity, keep all timings ≤120ms.

### The silky-smooth rule

"Silky" is a frame-rate promise, not a duration. Every animation in Oats must
hold 60fps on integrated graphics:

- Animate **only** `transform` and `opacity`. Animating `width`, `top`, `filter`,
  or `box-shadow` in a loop is a review-blocking defect. The one sanctioned
  exception is the stack's expand height, which is short, infrequent, and
  `will-change`-hinted.
- **One animated dither layer at a time**, ever (§7). The pulse and the graph
  never animate grain simultaneously.
- **The graph simulation is capped and it stops.** Force layout runs at most
  ~300 ticks, alpha-decays to rest, and then the canvas is idle — no permanent
  jitter, no CPU burn behind a window the user is reading. Dragging a node wakes
  it briefly and it settles again.
- **Nothing animates while the user is being helped.** A question card entering
  (§9.2) does not trigger a layout shift anywhere else on screen.

---

## 9. Signature components

There are six, and they _are_ the brand: the listening pulse, the question card,
the open-thread stack, the wheat field, the topic graph, and the lifetime graph.
Three live during recording, two live after, and the last looks across all of
them. They are held to this spec exactly.

### 9.1 The listening pulse

The single most important visual — and, at hero scale, **the record control
itself**. The seed you press is the seed that starts breathing, so there is one
object in two states rather than a button beside an unrelated indicator.

When a session is live the husked-oat seed **breathes** — a dithered toasted-gold radial expanding and
contracting on `--motion-ambient`. Calm, warm, alive. **Never** a red dot, never a
"REC" chip, never a banner the other person could see. Idle = static gold seed.
Paused = husk-gray seed, no motion.

### 9.2 The question card — catch every question

The help moment, and the thing the product is judged on. **Every question asked in
the room gets a card, the moment it is asked** — not only the unanswered ones, and
without waiting to hear whether anyone answers.

**Form.** A `surface-raised` card, `14px` radius, hairline + 1px dithered edge,
entering on `--motion-base`. Contents: the question verbatim in **mono** (verbatim
earns trust), a state mark in the §4 question-outcome vocabulary, and a single
gold action. Dismiss is a low-contrast ghost. Small, non-modal, never steals
focus, never covers the person you are talking to.

**Two phases, because instant and judged are different jobs.** Waiting to classify
an answer would cost seconds of silence — so the card does not wait:

1. **Appear (0ms, `Asked`).** The instant a question is recognized in the room,
   the card is on screen in its quietest state. This phase is local pattern
   recognition only — no model round-trip, no network, no downtime.
2. **Resolve (in place).** When the verdict lands, the _same card_ changes state
   rather than a second card appearing:
   - **Answered** → the card settles to `Answered` sage and **persists**. It is a
     record of the exchange, not an interruption. It ages out of the live rail on
     its own and is never lost — it is in the note.
   - **Uncertain or unanswered** → the card takes gold or terracotta and **opens
     the search in the browser automatically**. The user asked a question nobody
     could answer; the answer should already be waiting when they look. The card
     stays behind, marked `opened`, so the moment is still in the record.

**Repetition is signal, not noise.** A question asked twice gets two cards. A
question asked in a different shape — "do you know…" then "are you aware of…" —
gets its own card each time. Re-asking is how people mark what actually matters,
and collapsing it would erase exactly the signal Oats exists to catch. Cards for
the same subject visually **nest** under the first: indented, hairline-linked, the
repeats at 70% ink. Density is handled by stacking, never by suppression.

**Stacking.** Cards accumulate in a bottom-corner rail, newest at the bottom,
`base` enter with a 24ms stagger. Beyond four visible, older cards collapse into a
single husk-ink count chip ("6 earlier") that expands on click. The rail never
exceeds half the screen height and never blocks the center.

**Honesty.** Auto-open is real network activity and the UI says so plainly: the
card reads `searched · google` under the question once it fires, and Settings
carries one legible toggle for it. Audio and transcripts still never leave the
device — only the search text does, and only for questions nobody answered.

### 9.3 The open-thread stack — during recording

Live, on the Conversation surface, beside the pulse. It answers one question the
speakers cannot hold in their own heads: **what did we start and never finish?**

**Collapsed is the default and the normal state.** It rests as a thin vertical
rail: a stacked-card silhouette, the open-thread count, and the top thread's title
truncated to one line. It is peripheral — you should be able to talk for an hour
and never look at it.

**Expanded on demand.** One click (or the hotkey) grows it in place on
`--motion-slow` into a narrow column of threads, most-recently-dropped first:
title in ink, one line of the last thing said about it in mono husk, thread state
per §4. It is a **reminder, not a task list** — no checkboxes, no assignment, no
progress bars, no counts of anything but open threads. Clicking a thread does
nothing but scroll the live transcript to where it was dropped.

It auto-collapses when the user starts speaking again, and never expands itself.
The stack never has an urgent state; if it is nagging, it is wrong.

### 9.4 The topic graph — the Intelligence view

Lives in **Intelligence**, and it is _the_ reason to open a conversation. An
Obsidian-style force-directed map of how the conversation actually moved.

- **Nodes are topics**, not utterances. Radius scales with time spent (a gentle
  `sqrt`, clamped to a 3× range so one long tangent cannot dominate). Fill and
  dither density carry thread state (§4). Labels are mono, shown for the largest
  nodes and on hover for the rest — never a wall of overlapping text.
- **Edges are transitions.** A → B means the room moved from A to B; thickness is
  how often. Edges are hairline ink at low opacity — structure should be felt
  before it is read. A thread that was returned to shows a curved back-edge, which
  is the single most interesting mark on the canvas.
- **Layout** is force-directed with light charge, distance-weighted links, and a
  weak center gravity — then it _stops_ (§8). Calm and legible; whitespace over
  density. Drag to rearrange; the layout persists per conversation so the map a
  user has arranged stays arranged.
- **Gold appears exactly twice:** the selected node, and the re-search action.
  Everything else is ink, husk, and state marks.
- **Selecting a node** slides a quiet side panel with that topic's questions
  (reusing §9.2 card styling at rest), the transcript range, and re-search.
  Re-searching uses the same host-validated, HTTPS-only path as the live card.
- **Fallback:** under four topics there is no graph worth drawing — render the
  linear thread list instead. A three-node graph looks broken, not minimal.

### 9.6 Suggestions — what else is worth raising

Lives **inside the expanded open-thread stack** and nowhere else (§9.3). It is not
a surface, not a panel, and never a prompt: a short list you can glance at when
the room pauses, invisible while the rail is collapsed.

- At most four, mono, one line each, with a husk-ink reason chip: `left open`,
  `barely touched`, `usually comes up`.
- Ranked so the conversation's own signals always win. A thread this room opened
  outranks anything history can offer, no matter how often history offers it.
- Never actionable — no buttons, no dismiss, no "add to agenda". A suggestion is
  something to notice, and noticing is the whole interaction.
- Computed locally from data Oats already holds. It must never be a reason to
  call a model or touch the network.

### 9.7 The lifetime graph — what you keep coming back to

Lives in **Intelligence**, behind a quiet `Map` link beside the conversation list.
Not a fourth surface: the product has exactly three, and "what do I keep coming
back to?" is a question about your conversations.

- **Nodes are conversations**, sized by how much was discussed. Fill carries how
  connected each one is: a conversation joined to nothing is a one-off (husk,
  sparse dither), one that keeps reconnecting is a running thread (gold).
- **Edges are shared subjects**, and they are labelled by the words the two
  conversations actually have in common — never by one side's topic name, which
  would tell the reader the wrong thing about why the two are linked.
- **A caption names what recurs**, because a shape without a summary is a puzzle.
- Reuses the topic graph's canvas, physics, dither vocabulary, and keyboard path
  exactly (§9.4). Two graphs that behave differently would be two things to learn.
- Below three conversations there is nothing to see; say so in a sentence rather
  than drawing two dots and a line.

### 9.8 The field — the world Oats lives in

**The horizon is the app's permanent ground plane.** Sky above, earth below, and
every surface sits in that world. This replaces an earlier reading in which the
field was a recording decoration that appeared for a few seconds and left the app
as blank paper the rest of the time; permanence is what lets the other surfaces
stand on something, and it is why navigation runs along the ground rather than
down a rail that would cut the horizon in half.

Idle draws the world — sky, warmth, horizon, bare ground. **Pressing record grows
the wheat out of it**, and stopping lets it withdraw, more slowly than it came.
Keeping the world permanent and the wheat conditional preserves the one moment
Oats is allowed to be beautiful while giving the product a place to be.

- **It is a background, never a subject.** The pulse, the button, and the stack
  sit above it at full contrast; the field never rises above ~50% alpha and never
  competes with a word on screen. It also has a **volume**: full strength on
  Conversation, receded to roughly a third on Intelligence and Settings, which
  are for reading. At full strength the horizon line draws through a paragraph.
- **Light on paper is a wash, not a disc.** A literal sun cannot work in both
  modes — on oat-milk paper gold is _darker_ than the background, so a bright
  disc reads as a stain, and mixing it lighter makes it vanish against
  near-white. The horizon glow is instead weighted horizontally toward one side,
  so the light has a direction and an origin without its source ever being drawn.
  The same term reads as a genuine glow in Steel-cut.
- **It arrives and then settles.** ~1.4s to rise from the horizon on
  `--motion-slow`, then a breeze so slow it reads as stillness. It must never be
  the reason somebody looks at the screen mid-conversation.
- **It parts around the cursor.** Stalks bend away from the pointer — the single
  interaction, discoverable by accident, costing nothing.
- **It has depth, and the depth is manufactured.** The field is pseudo-2D: six
  discrete bands, no camera and no perspective divide. Depth is spelled four
  ways at once — position (far bands root under the horizon, the nearest roots
  _below_ the viewport, so you stand inside the field), motion parallax (near
  blades swing several times further, which is the strongest cue and the reason
  a still frame reads flatter than one second of motion), aerial perspective
  (far is low-contrast haze, near is gold), and **dither density** (§7): far
  blades dissolve into grain, near blades are solid. Blades are spread
  vertically _within_ their band, or the bands show as horizontal seams.
- **It grows, and it grows toward you.** Blades sprout from the horizon first
  and the front row last, so the field builds forward rather than fading up. A
  young blade is stiff and only starts catching the wind as it reaches full
  height — that one term is most of what makes it read as growth rather than as
  scaling. No overshoot, ever (§8).
- **The settled state is gusts, not a sway.** A uniform sine wave reads as a
  screensaver. Two gusts travel the field at incommensurate speeds so the
  pattern never visibly repeats, and between them the field is nearly still.
  The gust crossing is what holds the eye; the ambient term only stops it
  looking frozen.
- **GPU, but no meshes and no assets.** Instanced blades in a fragment-shader
  dither pass — the only place §7's animated grain is affordable, and the reason
  this surface is allowed WebGL at all. A blade is a tapered strip whose grain
  head is a swelling in its own silhouette; a downloaded mesh would be weight
  for a surface glanced at for seconds. Where WebGL is absent or software-only,
  a 2D canvas draws the same field, sparser and without grain — omit the
  texture, never counterfeit it.
- **It thins itself rather than dropping frames.** Density steps down if the
  frame budget slips. A prefix of each band is a uniform subsample, so the field
  gets sparser evenly instead of clearing a region.
- **`prefers-reduced-motion` freezes it** to a single still frame of the settled
  field — the image survives, the motion does not.

**Opacity accumulates.** The ~50% ceiling is on what lands on screen, not on a
blade. Two thousand blades at an individually safe alpha still stack into an
opaque wall that swallows the copy. When in doubt, fewer and fainter.

### 9.9 The epilogue — the countryside after a conversation

Stopping a recording lets the wheat withdraw; the epilogue is what arrives in
exchange, and it is a **transient reward, not a new permanent state**. The idle
world stays canonical: the scene blooms in over ~3.2s while the wheat settles,
holds ~9s, then settles back over ~7s, ease-out in and smoothstep out, no
overshoot anywhere. If a new recording starts mid-epilogue it yields within
600ms. It plays only after a conversation actually ended this session — never
on launch — and `prefers-reduced-motion` skips it entirely: its still
equivalent is the idle world, not a frozen half-arrived scene.

The scene is **the full dithered countryside** (chosen 2026-08-06; the timing
and geometry live in `fieldModel.ts` and both renderers read them):

- **The sky clears, in grain.** A blue bloom (`SKY_BLUE`) descends from the
  top of the frame, spelled in dither density; the warm light keeps the
  horizon, so it reads as evening after rain rather than a repaint. Oat milk
  takes a 1.45× deeper pour than Steel-cut — blue over near-white washes out
  long before it breaks the alpha ceiling — keyed off the same
  paper-vs-charcoal signal as the warm wash.
- **A hamlet condenses on the horizon**, opposite the light: an **irimoya**
  farmhouse (concave hip sweep, gable tier, raised ridge cap), a small kura
  storehouse, and a lone tree whose canopy dithers looser than the buildings —
  grown, not built. **The concave roof sweep is load-bearing and unit-tested:**
  a straight-edged roof reads as a Western barn at any proportions. Arrival is
  by dither density ramping with the epilogue — the same vocabulary far blades
  use for distance — never a fade or a slide.
- **A few birds cross**, right to left, ~50s per crossing: specks whose size
  breathes as a wingbeat, because at this distance a flap is a shimmer, not an
  outline.

Everything renders in the field's one canvas against the one shared Bayer
matrix, so §7's "one animated dither layer, ever" holds. The 2D fallback draws
the same scene smooth — same model, no counterfeit grain. Alpha stays within
§9.8's ceiling: the sky never exceeds 0.5 anywhere, and the dwelling sits at
0.5 on its lit pixels.

### 9.5 Empty states

Where warmth lives. A dithered oat-field horizon, one line of quiet mono copy, one
gentle next action. The place we can be a little beautiful because there is no data
to compete with.

---

## 10. Iconography

- **lucide-react** (already in the stack), 1.5px stroke, rounded caps/joins.
- Ink or muted-ink; gold only when the icon is the active accent (live, selected).
- Match the calm weight of the type; no filled/duotone icons except the oat symbol.
- Prefer a word over an icon when space allows — high-signal means legible.

---

## 11. Voice & tone

The copy is part of the design. Quiet, precise, never salesy.

- Lowercase-friendly, sentence case, **no exclamation marks**, no emoji in product UI.
- Say what happened, plainly. "Nothing was sent." "Search opens in your browser."
- Never hype ("AI-powered!", "Supercharge"). Never anthropomorphize loudly — Oats
  is a quiet colleague, not a chatbot persona.
- Privacy is stated as fact, and stated **exactly**: _"Audio and transcripts stay
  on this device. Unanswered questions are searched on Google."_ Never claim
  "nothing leaves your device" while auto-search is on — the whole trust argument
  dies on one overstatement. Say what leaves, when, and how to turn it off.
- Errors are calm and local: what happened, what to do, no blame, no jargon dump.

---

## 12. Accessibility

- Body text ≥ 4.5:1, large text ≥ 3:1 against its actual surface. Gold is never
  body text (it wouldn't pass) — enforced by §3.
- State is never color-only: question, thread, and topic states carry **dither
  density + shape/label** as well as hue (§4), so they read in grayscale and for
  color-blind users.
- The topic graph is not keyboard-hostile: nodes are tabbable in weight order, the
  side panel is reachable without a pointer, and the linear thread list is a
  first-class equivalent view, not a degraded one.
- Auto-opened searches must never steal focus from a live conversation — the
  browser opens in the background; the user turns to it when ready.
- Visible gold focus ring on every interactive element; full keyboard path,
  logical tab order, `:focus-visible`.
- Honor `prefers-reduced-motion` and `prefers-color-scheme`; both modes are
  first-class, neither is an afterthought.
- Dither layers are decorative — `aria-hidden`, never carrying information a screen
  reader needs.

---

## 13. Implementation map

Design lives in tokens, not scattered hex. Single source of truth is the Tailwind
v4 `@theme` block in `src/index.css`.

1. **Colors:** overwrite the existing `@theme` values (§3) — replace the blue
   `--color-primary` / violet `--color-accent` with the oat palette; add the
   `.dark` (Steel-cut) overrides.
2. **Motion + radius:** add `--motion-*` custom properties and bump `--radius` to
   `8px`; consumers reference tokens, never literals.
3. **Dither:** ship one 8×8 Bayer mask asset + a `.dither` utility class (mask +
   gradient); the pulse gets a small dedicated canvas/shader component.
4. **Type:** keep `--font-family-sans`; add `--font-family-mono` and the six-step
   size scale as utilities.
5. **shadcn:** reskin existing components against the new tokens — **do not
   rebuild** (mirrors IMPLEMENTATION.md Stage 5). Verify both modes at every step.
6. **Signature surfaces get dedicated components**, not one-off markup: the pulse
   (canvas), the question card + rail, the open-thread stack, and the topic graph
   (canvas, force layout). Anything reused across them lives in the §4 state
   vocabulary as a shared mark component, so the three surfaces cannot drift apart.

### Settings has a design rule too

Settings is where sleekness dies first, so it is specified, not left to taste.
The visible page carries **only** what a user must set to have a good first
conversation: processing choice, microphone, language, hotkey, auto-search
toggle, and data controls. That is the whole page.

Everything else — per-feature models, providers, endpoints, classifier tuning,
diagnostics, legacy configuration — lives behind **one** quiet `Advanced` entry at
the very bottom, husk-ink, never gold, never expanded by default, and never
surfaced by onboarding or by an error message. Advanced is a room you walk into,
not a section you scroll past. If a control is added to the visible page, an
existing one has to justify staying.

The bar for every screen: warm, quiet, one accent, structure over text, and grain
used like salt. If it feels like a SaaS dashboard, it's wrong. If it feels like a
private, well-made object you own, it's right.
