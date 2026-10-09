# Oats — Design System v2

**Status:** binding. Replaces the v1 "private conversation ledger" (paper, graphite,
gold, mono, dithering), which lives in git history.

> Oats should look and behave like the best desktop tools a team already uses —
> Linear, Notion, Granola, Raycast — so nothing about it has to be learned. The
> standard is the shadcn/ui (new-york) foundation, executed consistently: neutral
> surfaces with one warm brand colour, one type family, real controls, a predictable frame. Distinction comes
> from what Oats does with a conversation, not from novel chrome.

The product rules from v1 still hold and still win over taste:

- **Reliable.** Works with no network, no model and no account; never loses a
  conversation; fails loudly at the start, not quietly at the end.
- **Nothing competes with the person in the room.** While recording, the default
  (Clean) composition shows status and controls, not changing text.
- **Evidence before inference.** What Oats knows for certain (marks, questions and
  how they ended) is shown above what a model wrote.

---

## 1. Frame

```
┌───────────┬────────────────────────────────────────┐
│ ●●●       │ Title                        [actions] │  52px header (drag)
│ ◉ Oats    ├────────────────────────────────────────┤
│[● Record] │                                        │
│ ⌂ Home    │   content: max-w-3xl, px-8, py-6/8     │
│ ☰ Convos  │                                        │
│ ⌕ Search  │                                        │
│ Recent    │                                        │
│  · title  │                                        │
│ ⚙ Settings│                                        │
└───────────┴────────────────────────────────────────┘
```

- **Sidebar** (`shell/AppSidebar.tsx`), 232px, `bg-sidebar`, right border. Top
  52px band holds the macOS traffic lights (`windowConfig.js`: `{ x: 18, y: 18 }`)
  and moves the window. Then the brand row, the Record button (becomes a red
  **Stop recording** with elapsed time while live), Home / Conversations / Search,
  the six most recent conversations, and Settings pinned at the foot.
- **Header**, 52px, bottom border, the section title at `text-sm font-semibold`.
  It is a drag region; anything interactive inside it opts out.
- **Content** scrolls inside the main column. Reading width `max-w-3xl`, gutters
  `px-8`, vertical rhythm on a 4px grid (8 / 12 / 16 / 24 / 32).
- Navigation stays available while recording; Settings is the one destination
  closed during a recording (as ⌘, is).

## 2. Color

Neutral zinc surfaces, saturated status colours, and one brand colour; shadcn
semantic names (`src/index.css`, `@theme` and `.dark`).

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#ffffff` | `#09090b` | content |
| `sidebar` | `#fafafa` | `#0f0f11` | the frame |
| `card` | `#ffffff` | `#0f0f12` | cards |
| `foreground` | `#09090b` | `#fafafa` | text |
| `muted-foreground` | `#71717a` | `#a1a1aa` | secondary text |
| `border` | `#e4e4e7` | `#27272a` | dividers, card edges |
| `input` | `#d4d4d8` | `#3f3f46` | control edges |
| `primary` | `#f5a30f` | `#f5a30f` | the brand: the important action (fill, dark label) |
| `primary-foreground` | `#1a1306` | `#1a1306` | the label on a primary fill (8.9:1) |
| `brand-ink` | `#9a5b00` | `#f5b544` | brand-coloured text and icons (5.4:1 on white) |
| `ring` | `#f5a30f` | `#f5a30f` | focus rings and focused field edges |
| `recording` | `#ef4444` | `#ef4444` | recording, and only recording |
| `success` / `warning` / `destructive` / `info` | green / amber / red / blue | | status |

Rules:

- **No gradients, no textures, no glows.** Surfaces are flat; depth comes from a
  border and at most `shadow-xs`/`shadow-sm`.
- **The brand is one warm yellow-orange** (`primary`, "honey"). It marks the
  important action on a screen — New recording, Start recording, Save, Download —
  and the states that belong to it: a switch that is on, focus, selection, the
  current section's icon. It is a fill with a dark label; never orange text on
  white (use `brand-ink`). One primary button per view.
- **Red means recording or danger.** It is never decoration. Idle, the record
  action is the brand; live, it turns red and says Stop.
- Status is a soft badge (`bg-success/10 text-success`), never a colored border bar.
- Both themes are complete; follow the system appearance by default.

## 3. Type

- **Inter Variable**, bundled (`@fontsource-variable/inter`), so it works offline.
  One family for everything. Mono (`font-mono`) only for keyboard shortcuts in
  prose and machine identifiers — never for labels, dates, buttons or transcripts.
- Scale: `12` caption · `13` secondary UI · `14` UI body (default) · `15` reading ·
  `16` card titles · `22` page titles · `28` record titles. Weights 400 / 500 / 600.
- Sentence case everywhere. No all-caps labels, no eyebrow labels above headings.
- Times, durations and counts use `tabular-nums`. Dates go through `Intl`.

## 4. Components

Everything comes from `src/components/ui/` (shadcn/ui new-york):

- **Button** — `default` (brand), `secondary`, `outline`, `ghost`, `destructive`,
  `record`, `link`; sizes `sm` (32px), `default` (36px), `lg` (40px), `icon`,
  `icon-sm`. A button has a label and, where it helps, a 16px lucide icon on the
  left. Text links are for navigation inside prose only.
- **Input**, **Select**, **Toggle** (switch), **SegmentedControl** (one of a few
  options), **Tabs** (views of one object), **Badge** (status), **Card**,
  **Separator**, **Tooltip**, **DropdownMenu** (secondary actions), **Kbd**.
- Lists are cards with `divide-y` rows: title `text-sm font-medium`, meta
  `text-[13px] text-muted-foreground`, hover `bg-muted/60`.
- Settings are grouped cards of rows: label and description on the left, the
  control on the right.
- Alerts are a bordered row with an icon, tinted by tone (`warning`, `danger`).
- Radius: `rounded-md` (8px) for controls, `rounded-xl` (12px) for cards and
  panels. Focus: `ring-[3px] ring-ring/50` on every interactive element.

## 5. Recording surface

- **Clean (default):** a status card — pulsing red dot, the elapsed time as the
  heading (`text-2xl font-semibold tabular-nums`), a **Recording** badge, **Mark**
  (`M`) and **Stop** — then the contour in its own card section, then "Show what
  was said". Nothing on screen changes while somebody speaks except the clock and
  the contour.
- **Detailed:** adds the question cards, the live transcript, and the open threads
  below the status card, each in standard card/list styling.
- Health warnings (silent microphone, not saving, not transcribing) are alerts
  directly under the status card, so a busy conversation can never push them away.

## 6. Data visualisation

The conversation contour (`helpers/conversationContour.mjs`) and the topic/lifetime
graphs stay: every value in them is measured from the conversation. They draw in
`muted-foreground` with status colors for question marks, on the card surface,
with no decorative gradient.

## 7. Motion

150ms ease-out for hover, focus and press; 200ms for menus and dialogs
(`tw-animate-css`). No idle animation loops; the recording dot's ping is the one
ambient motion, and it stops under `prefers-reduced-motion`.

## 8. Voice

Plain, specific, sentence case. Buttons say what happens ("Start recording",
"Stop", "Export"). Errors say what happened and what to do. No marketing lines on
working screens. Brand names are not translated. Every string goes through
i18next in all ten locales.

## 9. Accessibility

- Every icon-only control has an `aria-label`; decorative icons `aria-hidden`.
- Visible focus on everything; nothing is pointer-only.
- Status changes are announced through the existing `aria-live` regions.
- Contrast: text ≥ 4.5:1; control edges and focus rings readable in both themes.
- Honour `prefers-reduced-motion`.

## 10. Where it lives

| Concern | File |
|---|---|
| Tokens, base layer | `src/index.css` |
| Primitives | `src/components/ui/*` |
| Frame | `src/components/shell/AppSidebar.tsx`, `OatsWorkspace.tsx` (shell) |
| Brand mark | `src/components/shell/OatsMark.tsx` |
| Window chrome | `src/helpers/windowConfig.js` |
