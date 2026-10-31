// The site's live figures: the app's own components, on the example
// conversation, in the figures that carry `data-live-slot` (index.html).
// site.js loads this file when a figure nears the screen and calls `mount`
// for it; until a figure is ready, its still or loop shows.
//
// Built into site/assets/live.js and live.css by `npm run build:site`, with
// React, the components, their styles and the example inside, so the page
// asks nothing of any other site. Each figure is drawn in a shadow root: the
// app's styles stay inside it and the page's stay out. Nothing here stores,
// sends or opens anything: the pieces are the demo pieces the setup tour shows
// (src/components/demo/), which are given no action that leaves the page.
//
// The page is light, so the figures are too, whatever the system's setting.

import { createElement as h, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import strings from "virtual:live-strings";
import properties from "virtual:live-properties";
import example from "../../src/helpers/sampleConversations/launch-readiness-review.json";
import { tourConversation } from "../../src/helpers/oatsTour.mjs";
import {
  DemoFlow,
  DemoOpen,
  DemoQuestions,
  DemoReplay,
  DemoVoices,
} from "../../src/components/demo/index.ts";

/** The hero's still is the live view at 11:09; its replay goes on from there. */
export const HERO_FROM_MS = 669_000;

// Built beside this file as assets/live.css. Named through a constant so the
// build leaves it a URL instead of inlining the uncompiled source.
const STYLESHEET = "live.css";
const STYLES = new URL(STYLESHEET, import.meta.url).href;

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: strings } },
  initAsync: false,
  interpolation: { escapeValue: false },
  returnEmptyString: true,
  returnNull: false,
});

// Tailwind's variables need their initial values registered, and a shadow
// root ignores @property rules, so the page registers them once (build.mjs
// takes them out of live.css). They are Tailwind's own `--tw-*` names, which
// the page does not use.
for (const property of properties) {
  try {
    window.CSS?.registerProperty?.(property);
  } catch {
    // Already registered: by an earlier copy of this file, or by the page.
  }
}

const conversation = tourConversation(example);

const PIECES = {
  hero: () => h(DemoReplay, { conversation, from: HERO_FROM_MS }),
  map: () => h(DemoReplay, { conversation }),
  topics: () => h(DemoFlow, { conversation }),
  questions: () => h(DemoQuestions, { conversation, replay: true }),
  after: () =>
    h(
      "div",
      { className: "flex flex-col gap-6" },
      h(DemoOpen, { conversation }),
      h(DemoVoices, { conversation })
    ),
};

/** Tells the figure it has drawn, once, after the first commit. */
function Drawn({ onDrawn, children }) {
  useEffect(() => onDrawn(), [onDrawn]);
  return children;
}

/**
 * Draws the figure's piece in a shadow root inside it. Resolves true once the
 * piece has drawn with its styles and fonts, and the figure says
 * `data-live="ready"` (site.css then hides the still or the loop); false for a
 * figure with no piece.
 *
 * @param {HTMLElement} figure
 */
export function mount(figure) {
  const piece = PIECES[figure.dataset.liveSlot];
  if (!piece || figure.querySelector(":scope > .live-host")) return Promise.resolve(false);
  const host = document.createElement("div");
  host.className = "live-host";
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = STYLES;
  const styled = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  const container = document.createElement("div");
  container.className = "live-root";
  shadow.append(sheet, container);
  figure.append(host);
  let markDrawn;
  const drawn = new Promise((resolve) => {
    markDrawn = resolve;
  });
  createRoot(container).render(
    h(StrictMode, null, h(I18nextProvider, { i18n }, h(Drawn, { onDrawn: markDrawn }, piece())))
  );
  return Promise.all([styled, drawn, document.fonts?.ready]).then(() => {
    figure.dataset.live = "ready";
    return true;
  });
}
