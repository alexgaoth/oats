// The site's behaviour: the oat marks, the fluid stage behind the hero and the
// download section, the download buttons, and the film. Built into
// site/assets/site.js by `npm run build:site` (site/vite.config.mjs).

import { mountMark } from "./mark.js";
import { mountField } from "./field.js";
import { wireDownloads } from "./download.js";

for (const canvas of document.querySelectorAll("canvas[data-mark]")) {
  mountMark(canvas, {
    shadow: canvas.dataset.mark === "large",
    toss: canvas.dataset.toss || "none",
    interactive: canvas.hasAttribute("data-interactive"),
  });
}

for (const canvas of document.querySelectorAll("canvas[data-field]")) {
  mountField(canvas);
}

wireDownloads();

// The film loads only when someone plays it (preload="none"): it is the
// heaviest file here.
const film = document.querySelector("#film video");
function playFilm() {
  if (!film) return;
  film.closest("section")?.scrollIntoView({ behavior: "smooth", block: "center" });
  film.play().catch(() => {
    // Autoplay with sound off can still be refused; the controls stay there.
  });
}
for (const button of document.querySelectorAll("[data-play-film]")) {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    playFilm();
  });
}
film?.addEventListener("play", () => film.closest(".film")?.classList.add("is-playing"));
