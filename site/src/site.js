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

// The product loops: real recordings of the app (demo/video's scene clips).
// Each plays while it is on screen and stops when it is not, so the page never
// runs more than the one in view; under reduced motion they stay on their
// poster, a still of the same moment.
const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const loops = document.querySelectorAll("video[data-loop]");
const watcher = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && !still?.matches) target.play().catch(() => {});
      else target.pause();
    }
  },
  { threshold: 0.35 }
);
for (const video of loops) watcher.observe(video);
still?.addEventListener?.("change", () => {
  if (still.matches) for (const video of loops) video.pause();
});
