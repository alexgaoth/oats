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

const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");

// The film loads only when someone plays it (preload="none"): it is the
// heaviest file here.
const film = document.querySelector("#film video");
function playFilm() {
  if (!film) return;
  film
    .closest("section")
    ?.scrollIntoView({ behavior: still?.matches ? "auto" : "smooth", block: "center" });
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
// poster, a still of the same moment. A loop moves for longer than five
// seconds, so each has a button to stop it, and the same button plays it for
// somebody who asked for less motion. What the person chose is kept while the
// page is open.
const PAUSE_ICON =
  '<svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>';
const PLAY_ICON =
  '<svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>';
const chosen = new Map();
const inView = new Set();
const toggles = new Map();
const wantsToPlay = (video) => chosen.get(video) ?? !still?.matches;
function settle(video) {
  const playing = wantsToPlay(video);
  const button = toggles.get(video);
  button?.toggleAttribute("data-paused", !playing);
  button?.setAttribute("aria-label", playing ? "Pause this loop" : "Play this loop");
  if (inView.has(video) && playing) video.play().catch(() => {});
  else video.pause();
}
const watcher = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) inView.add(target);
      else inView.delete(target);
      settle(target);
    }
  },
  { threshold: 0.35 }
);
for (const video of document.querySelectorAll("video[data-loop]")) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "loop-toggle";
  button.innerHTML = PAUSE_ICON + PLAY_ICON;
  button.addEventListener("click", () => {
    chosen.set(video, !wantsToPlay(video));
    settle(video);
  });
  toggles.set(video, button);
  video.closest("figure")?.append(button);
  settle(video);
  watcher.observe(video);
}
still?.addEventListener?.("change", () => {
  for (const video of toggles.keys()) settle(video);
});
