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
- **Alive, not busy** (Alex, 2026-10-11). Life comes from the oat world used as
  material (grain, field, honey, daylight) and from motion that answers what you
  did. Nothing moves at rest, content stays plain, and character goes only to the
  few things that matter: the frame, the main action, and the choices that change
  what you see.

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

- **Sidebar** (`shell/AppSidebar.tsx`), 232px, `bg-sidebar`, right border, with
  the wheat field at its foot (`shell/SidebarField.tsx`: the room the list leaves,
  120 to 240px, none in less; taller is more sky). Top 52px band holds
  the macOS traffic lights (`windowConfig.js`: `{ x: 18, y: 18 }`) and moves the
  window. Then the brand row, the Record button (honey with depth; a red **Stop
  recording** with elapsed time while live), Home / Conversations / Search, the six
  most recent conversations, and Settings pinned at the foot. The page you are on
  is a soft honey pill (`bg-primary/15`, `text-brand-ink`) with a honey icon.
- **Header**, 52px, bottom border, the section title at `text-sm font-semibold`.
  It is a drag region; anything interactive inside it opts out.
- **Content** scrolls inside the main column. Reading width `max-w-3xl`, gutters
  `px-8`, vertical rhythm on a 4px grid (8 / 12 / 16 / 24 / 32).
- Navigation stays available while recording; Settings is the one destination
  closed during a recording (as ⌘, is).
- **Focus on record.** While a conversation is recorded, Home gives it the
  window: the sidebar steps aside, and the recording column grows by the
  sidebar's width, so the live line gets the room and the column's right edge,
  where Stop is, does not move. The sidebar comes back when the recording stops.
  A sidebar button (`PanelLeft`) after the traffic lights, or `⌘\` (`Ctrl+\`),
  brings it back for the rest of that recording and hides it again.
  Conversations and Settings keep their sidebar, because it is the way back.
  Nothing is saved: the next recording starts focused
  (`helpers/recordingFocus.mjs`).

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
| `success` / `warning` / `destructive` / `info` | green / orange `#c2410c` (light) `#f97316` (dark) / red / blue | | status |

Rules:

- **Content is flat; the frame may carry the oat world.** Cards, lists and reading
  surfaces stay flat, with depth from a border and at most `shadow-xs`/`shadow-sm`,
  and no glows. The oat world may dress the frame where it never sits under words:
  the field at the sidebar's foot, empty states.
  The one exception in content: a chart's areas carry the field's dither (§6).
- **The main action has depth.** New recording and Start recording are honey with
  an inner highlight and a soft honey shadow, and they sink 1px when pressed
  (`.oats-cta` in `index.css`). They are the only controls with depth.
- **Character for the choices that matter.** The few choices that change what you
  see (how topics are drawn, what the recording view shows, how Intelligence lays
  out conversations) carry a small drawing of each view and a honey indicator that
  slides to the choice. Every other control keeps the plain shadcn look.
- **The brand is one warm yellow-orange** (`primary`, "honey"). It marks the
  important action on a screen — New recording, Start recording, Save, Download —
  and the states that belong to it: a switch that is on, focus, selection, the
  current section's icon. It is a fill with a dark label; never orange text on
  white (use `brand-ink`). One primary button per view.
- **Warning is orange, not amber.** Amber sat ΔE 1.8 from the honey brand in dark
  mode, so a warning read as the brand. Light mode uses orange-700 so warning text
  meets 4.5:1 on white.
- **The symbol is the honey oat grain** (`shell/OatsMark.tsx`): a small 3D grain,
  the same in light and dark mode, with no tile behind it. It is tossed once when
  the app first comes into view and again when the sidebar mark is clicked: it
  hops, tumbles end over end twice and lands with a small squash, while the light
  stays put (`helpers/oatsMarkMotion.mjs`). No toss under reduced motion. The app icon is the same grain on a light
  neutral tile; every icon file comes from `src/assets/logo.svg` and the masters
  in `scripts/` via `scripts/build-brand-icons.sh`.
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
- Headings use `text-wrap: balance`, running text `text-wrap: pretty` (base layer),
  so no line ends on one stranded word. Reading text (summary prose, transcript
  turns) is capped near 70 characters (`max-w-[70ch]`).

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
- **The example conversation** (`helpers/exampleConversation.mjs`). With nothing
  recorded, Home (under the record card) and the empty Conversations page
  (under Start recording) offer the bundled sample: a ghost button and one muted
  line, never honey, because Start recording is the main action on both. An
  example has a muted outline **Example** badge beside its title on Home, in the
  list and in the reading view. The sidebar's Recent list has none: at 232px
  the badge would take half of the title. Delete removes the example like any
  conversation, and the offer comes back when nothing is left.
- Radius: `rounded-md` (8px) for controls, `rounded-xl` (12px) for cards and
  panels. Focus: `ring-[3px] ring-ring/50` on every interactive element.

## 5. Recording surface

- **Clean (default):** a status card — listening red dot, the elapsed time as the
  heading (`text-2xl font-semibold tabular-nums`), a **Recording** badge, **Mark**
  (`M`) and **Stop** — then the contour in its own card section, then the
  **Calm / Words** view switch. Below it, the **conversation flow** card. Nothing
  on screen changes while somebody speaks except the clock, the two counters under
  it, the contour and the flow card — and the flow card shows topics, not words,
  so it changes every few minutes, when the subject does.
- **Counters** (`conversation/RecordingCounters.tsx`): one muted line under the
  clock, `13px` and `tabular-nums`: the words captured so far and the questions
  heard so far, in this sitting (`helpers/recordingCounters.mjs`). Words are the
  finalized segments' text, counted with `Intl.Segmenter` so Japanese and Chinese
  count words; questions are the question cards, one per asking. Each changes only
  when something lands, never mid-word. A number that changes rolls up once
  (`oats-roll`, `--motion-base`), never on its first value and not under reduced
  motion. The questions count is left out while question cards are off: a zero
  there would be a guess.
- **Conversation flow** (`conversation/ConversationFlow.tsx`): what has been
  talked about so far, as **lanes** (the default) or a **graph**. A view switch
  chooses Lanes / Graph, and the choice persists. The lanes
  (`conversation/TopicLanes.tsx`, `helpers/topicLanes.mjs`) are one row per
  topic in the order raised, with its minutes, and one line for the room: it
  runs along a topic's row while the room is on it, bends to the next row when
  the room moves, climbs back to an earlier row on a return, and ends at now
  with a honey dot. The topic now has a medium label and the Now badge; a
  pressed row is selected and quotes the topic. Past eight rows the card
  scrolls inside. The graph keeps its axes (x is when a topic was first raised,
  y how unsettled it still is); a return is an ink curve, a move on a quiet one,
  and the labels sit on plates. A one-line caption states the facts of the view
  shown: "8 topics, 3 returns to earlier topics".
- **Detailed:** adds the question cards and the live transcript below the flow
  card, each in standard card/list styling. The flow card then yields height to
  them (at most 40% of the column) and scrolls inside.
- Health warnings (silent microphone, not saving, not transcribing) are alerts
  directly under the status card, so a busy conversation can never push them away.
- **Lag** (`conversation/TranscriptLagBadge.tsx`): nothing while the text keeps
  up. Once the transcript trails the speech by more than 2 s, a quiet outline badge
  beside the clock says how far ("3.2 s behind"); past 5 s it takes the warning
  tone. It is measured (`helpers/transcriptLag.mjs`): main stamps each partial and
  final with the moment its audio was heard, counted back from when that audio
  reached main, so a moment can come out late but never early, and reports when
  the segmenter's speech starts and stops. The lag is the speech heard and not yet
  on screen, so it cannot grow in a silence. Smoothed (up with speech time, down
  with wall time, never above the last second's peak) with hysteresis at 2 s and
  5 s, so it does not flicker. Only for a room transcribed locally with partials:
  a cloud provider and Parakeet send no audio positions, and it never shows. It
  steps aside for the "not transcribing" warning, which says the same thing.
  Where the clock's line has no room for it (a row under 40rem, a narrow window
  in a long language), it sits at the end of the counters' line instead, so it
  never pushes Mark and Stop off the card.

## 6. Data visualisation

The conversation contour (`helpers/conversationContour.mjs`), the flow card's
graph, the topic graph and the Global conversations board stay: every value in them is measured from
the conversation. Every chart draws through one module
(`components/charts/chartStyle.ts`), by seven rules:

1. **Two line weights.** Data lines are 1.5 px, with round caps and joins.
   Rules (baselines, row dividers, ticks) are 1 px. No dashes anywhere.
2. **Three greys.** Ink (`foreground`) is for words and emphasis, quiet
   (`muted-foreground`) for data lines and marks, rule (`border`) for rules. No
   other opacities, except the fill.
3. **One accent.** Honey (`primary`) marks only "now" and "selected or hovered".
4. **Status colours only for question verdicts:** answered is filled
   `success`, unknown is filled `warning`, hedged is a soft `warning` fill
   inside a ring, and open (no verdict) is a ring in quiet.
5. **One dot:** radius 4, with a 2 px ring in `card`, so it stays clear on a
   line or on another dot.
6. **Nothing crosses a word.** Labels sit in a column, or on a plate in the card
   colour.
7. **Fill.** An area or mass is an ordered 4×4 Bayer dither of the quiet grey,
   locked to device pixels, with the field's matrix (`helpers/chartDither.mjs`).
   A fade under about 24 px tall (the list strips) is a 12% wash instead. This
   is the one exception to "content is flat" (§2): charts carry the dither.

- A question's mark has one vocabulary on every surface
  (`conversation/questionMarks.ts`), and it is always a complete circle of one
  size: **filled** when settled (answered in `success`, unknown in
  `warning`), a **soft fill inside a ring** when the answer was hedged
  (`warning`), an **empty ring** when there is no verdict (`muted-foreground`).
  The fill carries the meaning without colour. On a contour a question is a
  **dot on the line** at the moment it was asked; the one being read is a size
  up, ringed in honey.
- The live contour rolls: it shows the last four minutes with now at the
  right-hand edge, and redraws once a second, so the trace and every dot move one
  second to the left. Transcript speech and the microphone level both feed it,
  so it moves while somebody is talking. Its label describes the whole sitting.
- A finished contour keeps the shape the live one had: the recording keeps how
  loud each second was (one byte a second, `helpers/conversationLoudness.mjs`),
  and the record and every list strip take their height from it by the live
  rule. Conversations recorded before it was kept draw from their words.
- The legend under a contour lists only what that contour draws, in one row: how
  the questions ended, then the shape marks (new topic, marked).
- Talk time is a list of bars under the contour: each voice's name, a 6 px bar
  as long as its share against the voice that talked most, dithered at half
  density, and the share. Two columns from 420 px. Pressing a voice shows only
  its turns: its bar turns honey and its name medium. Unattributed speech is the
  last row, with a rule-grey bar.
- **Global conversations** (`components/global/`), the Conversations page's
  Global view: a board of charts across every conversation, one tab per
  conversation group, All first. The board is the background with a 1 px dot
  in the rule grey every 24 px. Each chart is a card on it (card colour, 1 px
  border, `rounded-xl`, `shadow-xs`) that snaps to the dots, moves by its
  header, resizes by its bottom-right corner and keeps one cell of board around
  it; the cards it would land on step down out of its way. Its remove button
  shows on hover or focus. Each tab keeps its arrangement; Reset layout, in the
  board's menu, puts back the default: the force graph above the arc timeline,
  filling the view.
- The board's charts share one highlight (`highlightStore.ts`,
  `linkedHighlight.ts`). Pointing at a conversation, or focusing it, lights it
  honey in every chart and its links ink, and everything else recedes to the
  rule grey (words recede only to the quiet grey, so they stay readable).
  Pointing at a subject lights the conversations and the links that carry it.
  A click opens the conversation, which stays selected, in honey, when you come
  back to the board.
- A subject's links are a thread: each conversation on it joins the one on it
  before (`subjectThreads`), not every other one. Joining every pair made 1,500
  links at 200 conversations, a solid mass in both charts.
- Pointing redraws only the canvases, from layers cached until the data, the
  size or the theme changes: nothing re-renders and nothing moves at rest.

## 7. Motion

150ms ease-out for hover, focus and press; 200ms for menus and dialogs
(`tw-animate-css`). Nothing moves at rest. Motion answers an action and runs once,
in 150 to 300ms with ease-out; the grain toss and a contour drawing itself are the
longer ones. While recording, the record dot follows the voice and the field may
sway, capped at 30 fps and stopped when the window is unseen. The dot's ring is
measured: it grows with the microphone level, read against the room's own range
(`helpers/listeningRing.mjs`), and rests while nobody speaks. It is written to the
element from a store subscription, never through React state. Everything is still
under `prefers-reduced-motion`: the dot has no ring.

- Buttons scale to 0.98 while pressed (`active:scale-[0.98]`), off under reduced
  motion.
- Content that is on its way (a summary being written) shows its shape as a
  skeleton under one status line, not a spinner. Spinners are for a control that
  is busy (a download row), never for a page region.
- The frame moves when a recording starts and when it stops: the sidebar glides
  out and back in 280ms (`--motion-frame`, `--ease-oats`). It is one transition
  of the frame's grid columns, so the conversation reflows into the room as it
  moves, with no animation code. Under reduced motion the sidebar goes and
  comes back at once.

## 8. Voice

Plain, specific, sentence case. Buttons say what happens ("Start recording",
"Stop", "Export"). Errors say what happened and what to do. No marketing lines on
working screens. Brand names are not translated. Every string goes through
i18next in all ten locales.

Copy rules (from the design-taste review, 2026-10-09):

- No em-dash or en-dash in a visible English string. Use a period, a comma or a
  colon. Translations keep their own punctuation.
- No exclamation marks, no "Oops". Say what happened and what to do.
- At most one middle dot (`·`) in a line; a list of facts is separate elements
  with icons, not a dotted strip.

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
