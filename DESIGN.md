# Oats — Design Language

**Product:** Oats · **Company:** arum · **Status:** v1 direction

> The interface should feel like the product does: a sharp, quiet person sitting
> next to you. Warm, tactile, unhurried, and completely private. Nothing shouts.
> The signature texture is **dithering** — the grain of an oat rendered in pixels.

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

The north-star test for any screen: *would it survive being the only thing a
founder keeps open all day?* If it adds noise, it fails.

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
- **The listening state IS branding:** when a session is live, the seed *breathes*
  (§9). That calm dithered pulse is the most recognizable thing about Oats.

Clearspace = the height of the seed on all sides. Never place the mark on a busy
photo; place it on paper (`surface-0`) or ink.

---

## 3. Color

Warm, low-chroma, single accent. Two modes: **Oat milk** (light) and **Steel-cut**
(dark). Values below map 1:1 onto the existing Tailwind v4 `@theme` tokens in
`src/index.css` — this *replaces* OpenWhispr's blue/violet palette.

### Oat milk (light)

| Token | Value | Role |
| --- | --- | --- |
| `--color-background` | `#F6F1E7` | oat-milk paper — the base |
| `--color-surface-0` | `#FBF7EF` | raised card / panel |
| `--color-surface-1` | `#F1EBDD` | recessed / list rows |
| `--color-surface-raised` | `#FFFDF8` | floating popover / the aide card |
| `--color-foreground` | `#2B2620` | roasted ink — all body text |
| `--color-muted-foreground` | `#6B6459` | husk — secondary text, timestamps |
| `--color-border` / `--color-border-subtle` | `#E3D9C6` | hairlines, dividers |
| `--color-border-hover` | `#D3C6AC` | hover edge |
| `--color-primary` | `#C67B27` | **toasted gold** — the one accent |
| `--color-primary-foreground` | `#FBF7EF` | text on accent |
| `--color-accent` | `#C67B27` | same as primary; there is only one |
| `--color-ring` / `--color-border-active` | `#C67B27` | focus ring |

### Steel-cut (dark)

| Token | Value | Role |
| --- | --- | --- |
| `--color-background` | `#201D18` | roasted charcoal |
| `--color-surface-0` | `#2A261F` | raised card |
| `--color-surface-raised` | `#322D24` | popover / aide card |
| `--color-foreground` | `#EDE6D6` | warm cream ink |
| `--color-muted-foreground` | `#A79E8C` | husk |
| `--color-border` | `#3B352B` | hairlines |
| `--color-primary` / `--color-accent` | `#E0A34A` | brighter toasted gold |
| `--color-ring` | `#E0A34A` | focus ring |

### Rules

- **One accent.** Toasted gold is the *only* saturated color, and it is spent
  carefully: the live pulse, focus, the primary action, a selected node. If two
  things on screen are gold, one of them is wrong.
- **Text is ink, never accent.** Gold fails body-text contrast on paper by design
  — it is a *mark* color (fills, dots, 1–2px strokes, large glyphs), not a reading
  color. Body text is always `foreground` / `muted-foreground`.
- **No pure `#FFF` / `#000`.** Everything carries warmth.

---

## 4. Semantic & state color — the Graph vocabulary

The Graph view encodes conversation structure. Outcomes get a color **and a dither
density** (§7), so state is legible even in grayscale and for color-blind users —
uncertainty literally looks grainier.

| State | Light | Dark | Dither | Meaning |
| --- | --- | --- | --- | --- |
| **Answered** | `#7C8B6F` sage | `#9FB08C` | solid (0%) | question got a clean answer |
| **Uncertain** | `#C67B27` gold | `#E0A34A` | medium (~40%) | hedged / partial answer |
| **Silence** | `#6B6459` husk | `#A79E8C` | sparse (~70%) | went unanswered, no response |
| **Unanswered / open** | `#C05B3C` terracotta | `#D07350` | dense edge | a real question left hanging |

Suggestion interaction states (shown / opened / dismissed / expired) use ink
opacity, not new hues: `shown` full, `opened` gold underline, `dismissed` 50%,
`expired` 30% + strikethrough. Terracotta replaces any hard red — warm, never alarming.

---

## 5. Typography

Restraint is the whole point. Two families, a six-step scale.

- **Sans (UI + display):** keep the humanist stack already loaded — Noto Sans
  (`--font-family-sans`), `-apple-system` on macOS. The wordmark and headings use
  the same family at tight tracking; we do not add a display face.
- **Mono (signal):** transcripts, timestamps, question text in the Graph, model
  names, hotkeys. `ui-monospace, "SF Mono", "Commit Mono", monospace`. Mono is the
  "machine heard this" voice — it earns trust by looking verbatim.

| Step | Size / line | Use |
| --- | --- | --- |
| `display` | 40 / 44, tracking −0.02em | onboarding hero, empty states |
| `title` | 28 / 34 | note title, section headers |
| `heading` | 20 / 28 | card titles, settings groups |
| `body` | 16 / 24 | default reading |
| `small` | 14 / 20 | secondary UI, labels |
| `caption` | 12 / 16, mono | timestamps, meta, signal chips |

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
   thresholds an animated radial against the Bayer matrix. This is the *only* place
   animated dither is worth the GPU — keep it to a small layer.
3. **Never** approximate dither with blurred noise or JPEG textures — it must be
   crisp, ordered, pixel-locked to the device, or it looks cheap instead of intentional.

### Where dither is allowed

- The husked-oat symbol fill, and the live listening pulse (§9).
- Full-bleed empty states and the onboarding hero (a dithered "oat field" horizon).
- Confidence encoding on Graph nodes/edges (§4) — density = uncertainty.
- A 1px dithered edge on raised surfaces in place of a glow.

### Where dither is forbidden

- **Behind or inside any text.** Never. Text sits on flat `surface`.
- Dense data (settings forms, transcript bodies, long lists).
- More than one dithered surface visible at a time. It is a moment, not a wallpaper.

Grain is always in the accent or ink family at low contrast (≤8% against its base)
unless it is deliberately the hero of an empty state.

---

## 8. Motion

Smooth, slow, decelerating. Motion should feel like something settling, not
snapping. It exists to preserve continuity, never to entertain.

| Token | Duration | Curve | Use |
| --- | --- | --- | --- |
| `--motion-instant` | 120ms | `cubic-bezier(.2,0,0,1)` | hover, focus, press |
| `--motion-base` | 220ms | `cubic-bezier(.2,0,0,1)` | cards in/out, view swaps, the aide card |
| `--motion-slow` | 380ms | `cubic-bezier(.2,0,0,1)` | onboarding steps, Graph reveal |
| `--motion-ambient` | 2400ms | `ease-in-out`, infinite | the listening pulse breath |

Patterns:
- **Enter:** fade + 8px rise (`base`). **Exit:** fade + 4px settle (`instant`).
- **View transitions** cross-fade; the outgoing view dims to 0 as the incoming
  rises. No horizontal slides, no bounce, no spring overshoot ever.
- **Graph reveal:** nodes settle in with a 30ms stagger along reading order.
- **Reduced motion:** honor `prefers-reduced-motion` — drop the pulse to a static
  dithered seed, replace rises with instant opacity, keep all timings ≤120ms.

---

## 9. Signature components

### The listening pulse
The single most important visual. When a session is live: the husked-oat seed sits
in the corner and **breathes** — a dithered toasted-gold radial expanding and
contracting on `--motion-ambient`. Calm, warm, alive. **Never** a red dot, never a
"REC" chip, never a banner the other person could see. Idle = static gold seed.
Paused = husk-gray seed, no motion.

### The aide card (question → search)
The quiet-help moment. A `surface-raised` card, `14px` radius, hairline + 1px
dithered edge, entering on `--motion-base`. Contains: the detected question in
**mono** (verbatim, earns trust), a one-line offer, and a single gold primary
action ("Search"). Dismiss is a low-contrast ghost. It is small, dismissible,
never modal, never steals focus, and auto-expires quietly (fade to 30%, then out).
Nothing leaves the device until the gold action is clicked.

### The Graph view — the signature surface
Elevated as *the* reason to open a note. Lays out the conversation's actual shape:
each question a node colored + dithered by outcome (§4), edges to its response,
suggestions as attached chips with interaction state. Layout is calm and readable —
whitespace over density, mono for the question text, ink for structure, gold only
on the selected node and re-search action. Re-searching from a node uses the exact
same host-validated, HTTPS-only, click-to-search boundary as the live card.

### Empty states
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
- Privacy is stated as fact, not sold: *"Audio and transcripts stay on this Mac."*
- Errors are calm and local: what happened, what to do, no blame, no jargon dump.

---

## 12. Accessibility

- Body text ≥ 4.5:1, large text ≥ 3:1 against its actual surface. Gold is never
  body text (it wouldn't pass) — enforced by §3.
- State is never color-only: Graph outcomes carry **dither density + shape/label**
  as well as hue (§4), so they read in grayscale and for color-blind users.
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

The bar for every screen: warm, quiet, one accent, structure over text, and grain
used like salt. If it feels like a SaaS dashboard, it's wrong. If it feels like a
private, well-made object you own, it's right.
