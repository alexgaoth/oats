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
   local object you own, not a cloud tab. Grain is a **material**, never a
   scene: paper and graphite, not weather and landscape.
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

- **One accent.** Toasted gold (flax) is the _only_ saturated color, and it is
  spent carefully: the live pulse, focus, the primary action, a selected node. If
  two things on screen are gold, one of them is wrong.
- **Gold is a momentary mark, not a premium finish.** It marks the thing that is
  live or selected _right now_. It is never a general accent for anything that
  wants to look considered, and never body text.
- **No blue anywhere as a visual-world colour.** The retired field carried a
  deliberately boosted slate sky, on the argument that it was weather rather
  than brand. A code comment cannot change the image a user sees. Materials
  only: paper, graphite, flax, fog, moss (§4 resolved), oxide (§4 denial).
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

**Case.** `oats` is lowercase; it is the wordmark and the only lowercase thing in
the product. Everything else — headings, navigation, commands, settings labels,
conversation titles — is **sentence case**. Blanket lowercase was tried and it
reads softer and more lifestyle-coded than this audience, who are being asked to
trust the tool with unannounced work. A settings label that will not capitalise
itself does not look calm; it looks like it is trying to seem calm.

**No display serif.** Personality is earned from the conversation contour, the
evidence hierarchy and precise spacing, not from a fashionable face.

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
- The question marks on the conversation contour (§9.8), where density is the
  §4 uncertainty encoding rather than texture.
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

There are seven, and they _are_ the brand: the listening pulse, the question card,
the open-thread stack, the conversation contour, the detected dialogue, the topic graph, and the
lifetime graph. Four live during recording, two live after, and the last looks
across all of them. They are held to this spec exactly. §9.0 governs which of
them the recording surface draws at all.

**Superseded 2026-08-20.** The fourth used to be a wheat field with a sky, a
horizon, birds and a farmhouse, drawn behind every surface. It is retired. Two
brands cannot share one product, and a pastoral world says pleasant summer
landscape, wellness app or artisanal farm brand — none of which is a private,
local instrument for consequential conversations. The replacement is not a
quieter backdrop but a different kind of thing entirely: a mark made _of the
conversation_, which is what an evidence tool should put on its own screen.

### 9.0 The two compositions of the recording surface

The recording surface draws the same conversation two ways, and **clean is the
default**.

**Clean** is for the person who is in the room: the listening pulse, the elapsed
clock, the contour, the dead-microphone warning, and the switch. It contains no
text that changes while somebody is speaking. Changing language on a screen
competes for the same faculty as the person talking, and this product's whole
claim is that it does not make you choose between the two.

**Detailed** is for the person checking the machine — _is it hearing me right,
did it catch that, what has it done_ — and adds the question annotations
(directly under the contour, §9.2), the **detected dialogue** beneath them
(§9.9), and the open-thread stack in the pinned foot (§9.3).

**That order is binding and was arrived at by measurement.** With the transcript
above the annotations in one scroller, the first question card sat 2,667px down
and receded ~57px with every finalized segment; with the annotations able to
shrink against the transcript's content height, the card measured **zero visible
pixels** past forty turns. The card is docked to the trace it annotates and takes
a fixed share; the dialogue takes the remainder.

They are compositions, never capabilities. Detection, classification, automatic
search, persistence, titling and threads are identical in both; clean hides
evidence and never withholds behaviour. **Assistive-technology output is
identical in both** — the status region and the question announcements do not
change, because for a non-visual reader the announcement is the surface, and a
"quieter" composition that told a screen-reader user less would be a quieter
product for them, not a calmer one.

The switch is on the surface, visible in both states, and labelled with what it
will do rather than with what is true. That is what keeps this from being a mode
to remember: the screen already says which composition you are in, because one
of them has the words in it.

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

**Form — an annotation, not a card.** A 2px left rule in the question's §4
outcome colour, the question verbatim in **mono** (verbatim earns trust), a state
mark whose dither grade is that outcome's, and the outcome word in text. **No
box**: no panel, no radius, no shadow. Dismiss is a low-contrast ghost. Small,
non-modal, never steals focus, never covers the person you are talking to.

_Superseded 2026-08-20 — this used to specify a `surface-raised` card with a 14px
radius and a dithered edge. Rendered, a stack of those read as notifications
borrowed from another application, floating over the trace rather than belonging
to it. A rule and words belong to a ledger; a rounded shadowed panel does not._

**The action is ink, gold on reach.** §9.2 previously called for "a single gold
action", which is right for one card and wrong for the four the surface actually
holds: four gold buttons is four accents, against §3's one. Reaching for it is
still the moment gold earns something.

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

**Stacking.** Annotations are **Detailed-only (§9.0)**, and there they are
**docked in the Conversation surface, directly
under the contour, on its left spine** — not in a corner and not in a window of
their own (§9.8; the detached overlay was deleted on 2026-08-20 and must not
return). **Newest at the top**, `base` enter with a 24ms stagger.

Newest-first is deliberate and it is the opposite of what this section used to
say. The band has a fixed height with the rest scrolled out of sight, so
oldest-first put the question just asked at the bottom — exactly where the
clipping happens, and measured at 1200×800 the newest annotation's top landed on
the band's own bottom edge. The thing that just happened is at the top; history
scrolls away beneath it, behind a fade that says so.

Beyond four groups, the rest collapse behind a husk-ink count chip ("6 earlier")
that expands **and collapses** on click. The annotations take **up to half the
band** between the pinned head and the pinned foot and scroll inside it, so a busy
conversation can never push the dead-microphone warning or the open-thread stack
off screen. They do not shrink: the detected dialogue below them (§9.9) takes the
remainder rather than bidding for space with its own content height. Measured
across a conversation growing from 2 to 120 turns the band holds at 126px with
44px of the newest card visible throughout — flat, where the shrinkable version
went 122px to 7px and the card from 44px to nothing.

**Honesty.** Auto-open is real network activity and the UI says so plainly: the
card reads `searched · google` under the question once it fires, and Settings
carries one legible toggle for it. Audio and transcripts still never leave the
device — only the search text does, and only for questions nobody answered.

### 9.3 The open-thread stack — during recording

**Detailed-only (§9.0).** Live, on the Conversation surface, in the pinned foot
below the dead-microphone warning — never above it, because the warning is the
reliability promise and the stack is a reminder. It answers one question the
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

### 9.8 The conversation contour — the signature mark

**A conversation, drawn as the thing it actually was.** One thin trace, left to
right in time, and everything on it is a measurement of the recording it belongs
to. The model is `src/helpers/conversationContour.mjs`, pure and pinned by
`test/helpers/conversationContour.test.js`; the renderer owns pixels and nothing
else, so the meaning of the mark cannot drift from its drawing.

Four elements, each a fact:

| Element              | Encodes                                                             |
| -------------------- | ------------------------------------------------------------------- |
| **Trace thickness**  | how much was said, per unit time                                    |
| **A thinning**       | a silence — the line never breaks, because the conversation did not |
| **A notch**          | the subject turning                                                 |
| **A mark, above**    | a question at the moment it was asked, in its §4 state colour       |
| **The mark's grain** | how settled that question is — solid answered, grainiest unasked-of |
| **An arc**           | the room returning to a thread it had left                          |

Rules:

- **Every element is derived from speech.** Nothing here may be generated by a
  noise function, a seed, or elapsed time alone. If two different conversations
  can produce the same contour, it has become wallpaper and it is wrong.
- **Dither carries information, never texture.** A mark's density is the §4
  uncertainty encoding, which is what keeps state legible in greyscale and for
  colour-blind users. Decorative grain on the contour is a review-blocking
  defect.
- **It does not animate.** It redraws when the conversation changes — roughly
  once every five seconds while recording, and never afterwards. There is no
  loop to throttle and nothing for `prefers-reduced-motion` to reduce, which is
  the point: the previous signature held a GPU at 60fps to redraw an unchanging
  picture, and idling on it cost 113% of a core.
- **Three sizes, one model.** Full (the live surface and the head of a
  conversation's record), and a 20–24px strip beside a conversation in a list.
  The strip keeps the question marks and drops the notches and arcs; a list is
  scanned for "three unanswered questions in the last third".
- **An empty conversation draws its own resting baseline** — the ledger before
  anything is written in it. It is never faked with invented geometry.

**The surface behind it is paper.** No sky, no scenery, no permanent world. A
reading surface is `--color-background` and nothing else, and the contour is the
only non-textual mark on it.

### 9.9 The detected dialogue — Detailed-only

The answer to the only question the recording surface could not previously
answer: **is it hearing me correctly?** One echoed line proves something
arrived; it proves nothing about whether it arrived right, and somebody deciding
whether to trust an hour of their conversation to this needs to read a paragraph
of it.

**Voice: mono, always.** §5 gives transcripts the "machine heard this" voice, and
it earns trust precisely by looking verbatim. The reading view renders the same
content at `font-mono text-[13px]`; one transcript may not have two voices on two
surfaces. Nothing here is uppercase — sentence case is the rule for everything
but the wordmark.

**Turns, not segments.** Speech finalizes in ~5s chunks. Drawn one paragraph per
chunk, one person's sentence looks like four people arguing. Consecutive chunks
from one speaker are joined into the turn they were.

**Attribution is the margin, the words are the entry** — the same relationship
the annotations have to the contour. The two-voice vocabulary is the stored
transcript's: you, and the room, replaced by a diarized name when there is one.
The separator between them must be a _character_, not margin: `textContent` is
what a screen reader and the clipboard read, and margin is invisible to both.

**Bounded, and it follows.** Its own scroller with a real bound — a flex child
with `min-h-0`, never `max-h-full`, which resolves against a content-height
parent and bounds nothing. It follows the newest turn, and stops following the
moment the reader scrolls away from the end: auto-scrolling somebody off the line
they went back to check is the specific way live transcripts become useless.
Following resumes when they return to the end themselves.

**Silent.** `role="log"` with `aria-live="off"`. A transcript that announced
itself would read the conversation aloud over the conversation, which is the one
thing this surface must never do. The status region and the question
announcements are the spoken channel; this is the visual one, reachable by
keyboard and named for the accessibility tree.

**No affordances.** No timestamps, no per-turn controls, no selection handles. A
live transcript that invites editing is one somebody edits instead of listening.

### 9.5 Empty states

One line of quiet mono copy and one gentle next action — usually the shortcut
that makes the screen fill itself.

**An empty screen is not licence for scenery.** That was the old reading, and it
is what let a landscape in through the back door: nothing to compete with became
a reason to be beautiful, and the beauty had nothing to do with the product.
Where the surface has data of its own, show the smallest true thing instead — the
Conversation screen shows the last entry in the ledger and its contour, which
answers "did that save?" and gives the screen an identity at the same time.

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
