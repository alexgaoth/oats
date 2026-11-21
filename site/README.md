# The Oats site

The public page for Oats, served as it is from this folder (no build on the host).
Production: https://oats.alexgaoth.com (Vercel project `oats-mac`, root directory `site`).

| Path | What it is |
|---|---|
| `index.html`, `assets/site.css` | The page. Copy follows `DESIGN.md` §8 and the fact bank: every claim has a source in the repo. |
| `src/` | The page's behaviour: the oat mark (the app's own painter and toss), the film's grey fluid as a WebGL shader, the download buttons, the product loops with their pause buttons, and the loader of the live figures. |
| `src/live.js`, `src/live.css` | The live figures: the app's own components on the example conversation, drawn in the figures that carry `data-live-slot`. |
| `assets/site.js` | `src/site.js` built with the app's brand modules. Committed, so the host needs no build. |
| `assets/live.js`, `assets/live.css` | `src/live.js` built with React, the components, their styles and the example. Committed too. Loaded only when a live figure nears the screen. |
| `assets/fonts/` | EB Garamond (the wordmark, as in the film) and Inter (the app's face), both SIL OFL 1.1, served from here so the page asks no other site for anything. |
| `assets/*.png` | Favicons, the touch icon and the link preview, painted by `render-images.cjs`. |
| `media/` | Screens from the demo harness (`demo/capture.mjs`, the `site-*` shots) and the film. `media/manifest.json` says what each one shows and how it was made. |
| `build.mjs`, `sources.mjs`, `live-strings.mjs` | The build: the bundles, the inputs each is hashed from, and the English the live figures carry. |
| `measure-live.mjs` | Measures each live figure's height at every width and writes the table in `assets/site.css`. |

```sh
npm run build:site                                  # rebuild assets/site.js, live.js and live.css
node site/measure-live.mjs --write                  # after a change to a live figure's height
node_modules/.bin/electron site/render-images.cjs   # repaint the favicons and the link preview
python3 -m http.server 5480 --directory site        # look at it locally
```

## The live figures

Five figures carry `data-live-slot`. Each shows the app's own components, usable, on the example conversation
Home offers (the same demo pieces the setup tour shows, `src/components/demo/`):

| Slot | What runs there |
|---|---|
| `hero` | The live view played back from 11:09, the moment of the still: the line grows, topics take their lanes, each question's mark appears and settles. Play / Pause and a scrubber. |
| `map` | The same replay, from the first words. |
| `topics` | The flow card: Lanes or Graph, and a press on a topic quotes it. |
| `questions` | The question cards appearing and settling, with Replay. Dismiss and its Undo work on the page only. |
| `after` | What was left open, with the answers, and talk time: a voice's turns open under it. |

- **Loaded when needed.** `site.js` loads `live.js` when the first figure comes within half a screen, and draws
  each figure as it nears. The still or the loop's poster shows until the figure is ready; a loop in a live figure
  never fetches its film. If `live.js` cannot load, the figures keep their stills and the loops play.
- **No layout shift.** With scripts on (`@media (scripting: enabled)`), each figure is its component's height from
  the first paint, from a table measured with `measure-live.mjs`, with the still shown whole at its top. With
  scripts off the page is as it was. Run `measure-live.mjs --write` again when a component's height changes.
- **Its own styles, in a shadow root.** Each figure is drawn in a shadow root with `live.css` (Tailwind with the
  app's tokens and motion, `src/styles/`), so the app's styles stay in and the page's stay out. A shadow root
  ignores `@property`, so `build.mjs` takes Tailwind's out and `live.js` registers them for the page.
- **Light, like the page.** The figures use the app's light tokens whatever the system's setting.
- **Nothing leaves the page.** No request but the page's own files, no cookies, no storage: the demo pieces read no
  store and are given no action that leaves the page (a web search, opening a turn, naming a voice). Under reduced
  motion the replays start on the finished map and the cards are settled.
- **Small.** About 150 KB gzipped for both files (`build.mjs` prints the size; the test holds it under 250 KB).
- **Never stale.** `assets/live.js.sources` is a hash of every file `live.js` imports, its styles and its strings;
  `test/helpers/site.test.js` fails until `npm run build:site` runs after a change to any of them.

The download buttons link to `releases/latest/download/Oats-arm64.dmg` and `Oats-x64.dmg`, the names the
release job publishes in every version, so a new release needs no change here except the version on the page.
`test/helpers/site.test.js` checks that, the bundles, the files the page uses, the live slots and figures, the
media manifest, and the voice rules.
