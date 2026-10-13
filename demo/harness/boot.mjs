// Boots the real Oats renderer in a browser, against the fake main process and
// the sample conversations, then exposes `window.oatsDemo` to direct it.
//
//   /demo.html?panel=true                          the samples, to look around
//   /demo.html?panel=true&demo=live                the review, recorded live
//   /demo.html?panel=true&demo=live&from=720&speed=1&view=words&theme=dark
//
// Parameters: `demo=live` replays the launch review as a live recording (the
// other samples are already there; the review is the one being recorded);
// `from` seeks there once recording starts (seconds); `speed` is the replay
// rate; `end=hold` keeps recording at the end instead of pressing Stop;
// `edits=0` leaves the voices unnamed after Stop; `theme`, `view` and `flow`
// as in `settings.mjs`. `panel=true` is the app's own: the workspace window.

import mainFixture from "../../src/helpers/sampleConversations/launch-readiness-review.json";
import { installClock } from "./clock.mjs";
import { createFakeMain } from "./fake-main.mjs";
import { installFakeMicrophone } from "./media.mjs";
import { createReplay } from "./replay.mjs";
import { applyDemoSettings } from "./settings.mjs";

const supporting = Object.values(
  import.meta.glob("../fixtures/*.json", { eager: true, import: "default" })
);

const params = new URLSearchParams(window.location.search);
const live = params.get("demo") === "live";

installClock();
applyDemoSettings(params);
installFakeMicrophone();

const main = createFakeMain({ fixtures: live ? supporting : [mainFixture, ...supporting] });
window.electronAPI = main.api;

const replay = createReplay({
  main,
  fixture: mainFixture,
  options: { hold: params.get("end") === "hold", edits: params.get("edits") !== "0" },
});

const TABS = ["summary", "transcript", "connections"];

function pressTab(name) {
  const index = TABS.indexOf(name);
  const tab = document.querySelectorAll('[role="tab"]')[index];
  if (!tab) return false;
  // Radix tabs change on mouse down.
  tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  tab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  // A script is not a keyboard: no focus ring left behind for a screenshot.
  tab.blur();
  return true;
}

function pressButton(label) {
  const button = [...document.querySelectorAll("button, [role='radio'], [role='tab']")].find(
    (element) => element.textContent?.trim() === label
  );
  button?.click();
  button?.blur();
  return Boolean(button);
}

const frame = () => new Promise((resolve) => setTimeout(resolve, 120));

window.oatsDemo = {
  ...replay,
  /** Open a sample conversation in the reading view, on a tab. */
  async open(sampleId = "launch-readiness-review", { tab = "summary" } = {}) {
    const note = main.db.noteBySample(sampleId) ?? main.db.findNote(Number(sampleId));
    if (!note) throw new Error(`oatsDemo: no conversation ${sampleId}`);
    window.dispatchEvent(new CustomEvent("oats-open-note", { detail: note.id }));
    await frame();
    if (tab !== "summary") pressTab(tab);
    await frame();
    return note.id;
  },
  /** Switch tab in the reading view: "summary", "transcript" or "connections". */
  tab: async (name) => {
    pressTab(name);
    await frame();
  },
  /** Go to "home", "conversations" or "map". */
  async show(view) {
    if (view === "home") {
      pressButton("Home");
    } else {
      window.dispatchEvent(new Event("oats-show-conversations"));
      await frame();
      window.dispatchEvent(new Event("oats-intelligence-back"));
      await frame();
      pressButton(view === "map" ? "Map" : "List");
    }
    await frame();
  },
  /** The ids of the sample conversations held, newest first. */
  samples: () =>
    main.db.notes
      .filter((note) => note.sample_id && !note.deleted_at)
      .map((note) => ({ id: note.id, sampleId: note.sample_id, title: note.title })),
};

await import("/main.jsx");

if (live) {
  const speed = Number(params.get("speed"));
  if (speed > 0) replay.speed(speed);
  const from = Number(params.get("from"));
  if (from > 0) void replay.seek(from);
  void replay.play().catch((error) => console.error(error));
}
