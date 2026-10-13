import { continueRender, delayRender, staticFile } from "remotion";

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
