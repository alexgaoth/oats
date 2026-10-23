import { continueRender, delayRender, staticFile } from "remotion";

/**
 * The wordmark's face on the title and end cards: EB Garamond (SIL OFL 1.1),
 * regular, as hillclimb.com sets its own name (Alex's pick); the app itself
 * stays in Inter. Loaded from Google Fonts by the renderer, once, before any
 * frame: the Latin subset of weight 400.
 */
const WORDMARK_URL =
  "https://fonts.gstatic.com/s/ebgaramond/v33/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-6_RkBI9_WamXgHlI.woff2";
export const WORDMARK_FONT = '"EB Garamond", "Times New Roman", serif';
let wordmarkLoaded = false;
export function loadWordmark() {
  if (wordmarkLoaded || typeof document === "undefined") return;
  wordmarkLoaded = true;
  const handle = delayRender("Loading EB Garamond");
  new FontFace("EB Garamond", `url(${WORDMARK_URL}) format("woff2")`, { weight: "400" })
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
