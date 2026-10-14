import { continueRender, delayRender, staticFile } from "remotion";

/**
 * The wordmark's face on the title and end cards: Young Serif (SIL OFL 1.1),
 * a warm old-style serif that sits beside the grain; the app itself stays in
 * Inter. Loaded from Google Fonts by the renderer, once, before any frame.
 */
const WORDMARK_URL = "https://fonts.gstatic.com/s/youngserif/v2/3qTpojO2nS2VtkB3KtkQZ1t93kY6ah7E.woff2";
export const WORDMARK_FONT = '"Young Serif", Georgia, serif';
let wordmarkLoaded = false;
export function loadWordmark() {
  if (wordmarkLoaded || typeof document === "undefined") return;
  wordmarkLoaded = true;
  const handle = delayRender("Loading Young Serif");
  new FontFace("Young Serif", `url(${WORDMARK_URL}) format("woff2")`)
    .load()
    .then((font) => {
      document.fonts.add(font);
      continueRender(handle);
    })
    .catch((error) => {
      console.error(error);
      continueRender(handle);
    });
}

// The app's Inter (OFL), loaded once before any frame renders.
let loaded = false;
export function loadInter() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("Loading Inter");
  const face = new FontFace("Inter", `url(${staticFile("fonts/InterVariable.woff2")}) format("woff2")`, {
    weight: "100 900",
  });
  face
    .load()
    .then((font) => {
      document.fonts.add(font);
      continueRender(handle);
    })
    .catch((error) => {
      console.error(error);
      continueRender(handle);
    });
}
