# The Oats site

The public page for Oats, served as it is from this folder (no build on the host).
Production: https://oats.alexgaoth.com (Vercel project `oats-mac`, root directory `site`).

| Path | What it is |
|---|---|
| `index.html`, `assets/site.css` | The page. Copy follows `DESIGN.md` §8 and the fact bank: every claim has a source in the repo. |
| `src/` | The page's behaviour: the oat mark (the app's own painter and toss), the film's grey fluid as a WebGL shader, the download buttons. |
| `assets/site.js` | `src/` built with the app's brand modules. Committed, so the host needs no build. |
| `assets/fonts/` | EB Garamond (the wordmark, as in the film) and Inter (the app's face), both SIL OFL 1.1, served from here so the page asks no other site for anything. |
| `assets/*.png` | Favicons, the touch icon and the link preview, painted by `render-images.cjs`. |
| `media/` | Screens from the demo harness (`demo/capture.mjs`) and the film. `media/manifest.json` says what each one shows. |

```sh
npm run build:site                                  # rebuild assets/site.js after changing src/ or the app's painter
node_modules/.bin/electron site/render-images.cjs   # repaint the favicons and the link preview
python3 -m http.server 5480 --directory site        # look at it locally
```

The download buttons link to `releases/latest/download/Oats-arm64.dmg` and `Oats-x64.dmg`, the names the
release job publishes in every version, so a new release needs no change here except the version on the page.
`test/helpers/site.test.js` checks that, the bundle, the files the page uses, and the voice rules.
