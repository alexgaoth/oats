---
name: oats-design
description: The working method for any change to how Oats looks, moves, or feels — the pencil test, the review-blocking defects, the verification loop, and when to overhaul rather than polish. Use for any UI, UX, visual, motion, copy, or information-architecture work in this repo, including "make this nicer", "this feels off", and new surfaces.
---

# Oats design

`DESIGN.md` is the binding spec — what things must look like. This is the
**working method**: how to make a change, what fails review, and what has
already cost hours. Read `DESIGN.md` for the values; read this before you touch
anything.

Two general skills are installed and worth invoking alongside this one:
`frontend-design` (aesthetic direction, subject grounding, the critique loop)
and `web-design-guidelines` (accessibility and interaction audit). **Where they
disagree with `DESIGN.md`, `DESIGN.md` wins.** They are written for web pages;
Oats is a desktop instrument.

---

## The bar: the pencil test

Everything here reduces to two properties. A pencil has both. Oats must.

### Reliable

A pencil has no battery, no permission prompt, no network, no account, no
update, and no state that can be lost. It works the ten-thousandth time exactly
like the first. **Nobody has ever been let down by a pencil**, and that is why
people trust it with things that matter.

Concretely, for any change you make:

- Does it work with **no network, no model downloaded, and no API key**? If it
  needs any of those, it is not a default — it is an Advanced path.
- Can any failure **lose a conversation**? Losing a recording is the one
  unforgivable bug in this product. A conversation happens once. Prefer saving
  something partial and ugly over risking nothing at all.
- Does it fail **loudly at the start** or quietly at the end? A dead microphone
  must surface in the first seconds, while it can still be fixed — not after an
  hour, when the recording is already gone.
- Does it add a state that can be **wrong**? Every mode, cache, and toggle is a
  new way to betray someone.

### Intuitive

Nobody was taught to use a pencil. You pick it up and you already know, because
the shape tells you. There is no mode, no menu, and nothing to remember between
uses.

- Can someone who has **never seen Oats** start a conversation without reading
  anything? If a surface needs a tooltip to be usable, the surface is wrong.
- How many actions and how many milliseconds between *"I want this recorded"*
  and **recording**? That number is the product. Defend it.
- Is there a **mode** the user must be in? Modes are the opposite of a pencil.
  Every one must justify itself against being deleted.
- Would a returning user need to relearn anything? Nothing here should reward
  memorisation.

### The test that overrides taste

**During a conversation, does anything on screen compete with the person you are
talking to?** If yes, it is wrong no matter how good it looks. Oats is used
while its user's attention belongs to someone else in the room. That constraint
outranks every aesthetic argument.

---

## Who it is for

**Academics, hackers, and founders — in their daily conversations.** People
whose edge is remembering, connecting, and acting on what was said. They are
privacy-sensitive, allergic to setup friction, and fluent enough to resent being
condescended to.

Design consequences that follow directly:

- **No hand-holding.** No onboarding tours, no empty-state tutorials, no tips.
  Show the thing; they will work it out.
- **No hype.** This audience can smell marketing copy. See `DESIGN.md` §11.
- **Density is respect, but only where it carries meaning.** A wall of chrome is
  not density. A transcript is.
- **They will read the network claims.** Be exact or lose them entirely.

---

## Read before changing anything

1. `DESIGN.md` — the binding spec. §1 ethos, §4 state vocabulary, §8 motion, §9
   the six signature surfaces.
2. `CLAUDE.md` — active product direction and the question-handling rules that
   override older code and comments.
3. The surface's existing component, in full, before editing a line of it.

---

## Review-blocking defects

`DESIGN.md` (v2) is the spec: the standard shadcn/ui new-york system on neutral
zinc, Inter, and the sidebar frame. Each of these is checkable, and any one of
them fails review.

1. **A colour or motion literal** where a token exists. Single source of truth is
   the `@theme` block in `src/index.css`.
2. **A hand-made control where a `src/components/ui/` primitive exists** — a text
   link posing as a button, an underline posing as an input, a row of words
   posing as tabs. Use Button, Input, Select, Toggle, SegmentedControl, Tabs,
   Badge, Card, DropdownMenu.
3. **Text off the type scale** (`DESIGN.md` §3) or `font-mono` on labels, dates,
   buttons or transcripts. Mono is for shortcuts in prose and identifiers only.
4. **A surface that works in only one colour mode.** Both are first-class.
5. **No visible focus** on an interactive element, or no `prefers-reduced-motion`
   path for an animation.
6. **A gradient, texture, glow or decorative animation.** Surfaces are flat.
7. **Red for anything but recording or danger**; the brand yellow-orange as
   text on a light surface (use `brand-ink`), or on more than one primary button
   in a view.
8. **The phrase "nothing leaves your device"** in copy, docs, or comments. It is
   false while auto-search is on. State what leaves, when, and how to switch it off.
9. **A new user-facing string not added to all 10 locale files.**
10. **Changing text in the Clean recording composition** beyond the clock and the
    contour. Nothing may compete with the person in the room.

---

## Hard-won — these cost real hours

- **Opacity accumulates.** Alpha ceilings apply to what reaches the screen, not
  to one element. The wheat field shipped at 7,200 blades of individually "safe"
  alpha and stacked into an opaque wall that swallowed the copy. Fewer and
  fainter.
- **Never call `getComputedStyle` inside a draw loop.** It forces a style
  recalculation every frame. Read the palette on mount and on theme change via
  `MutationObserver`.
- **`backgroundThrottling: false`** is set on the control panel
  (`windowConfig.js`), so Chromium will *not* pause your animation when the
  window is hidden. Gate loops on `document.hidden` yourself.
- **Anything drawn in discrete bands needs per-item jitter within the band**, or
  the bands render as visible seams.
- **Do not pass `desynchronized: true`** to a canvas context. Under the Linux
  build's software compositing it lets partially-presented frames through as
  tile seams.
- **No side effects during render.** React 19 StrictMode double-invokes render
  specifically to catch this. Probes and context creation belong in a lazy
  `useState` initialiser or an effect.

---

## The verification loop

**Never ship a visual change you have not looked at.** Reasoning about pixels
does not work; every real defect in the wheat field was found by screenshotting
it and none by reading the code.

1. Plan, then **critique the plan before building**. If it resembles the generic
   default you would produce for any similar app, revise it and say what changed.
2. Build.
3. **Render it and look** — a Vite harness page plus Electron `capturePage()` is
   the established path. Delete the harness afterwards.
4. Check **both colour modes** and the **reduced-motion** path.
5. **Remove one thing** before calling it done.
6. Run `npm run verify:oats`.

---

## Overhaul over polish

`CLAUDE.md` is explicit: the current UI is still far too close to OpenWhispr,
and that is a product-level concern, not polish debt. **Do not preserve or
reskin inherited OpenWhispr layouts, component patterns, or product feel.**

Choose a rewrite, not a tidy-up, when any of these is true:

- The layout is an inherited OpenWhispr shape.
- The surface is configuration-shaped where it should be conversation-shaped.
- Making it good would require more exceptions than rules.
- It fails the pencil test structurally — a mode, a setup step, or a thing to
  remember — rather than cosmetically.

A large overhaul is explicitly sanctioned. Deleting a surface is a valid
outcome. When you do rewrite, say what you removed and why.
