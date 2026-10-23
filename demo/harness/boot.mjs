// Boots the real Oats renderer in a browser, against the fake main process and
// the sample conversations, then exposes `window.oatsDemo` to direct it.
//
//   /demo.html?panel=true                          the samples, to look around
//   /demo.html?panel=true&demo=live                the review, recorded live
//   /demo.html?panel=true&demo=live&from=720&speed=1&view=words&theme=dark
//   /demo.html?panel=true&profile=empty            nothing recorded yet
//
// Parameters: `demo=live` replays the launch review as a live recording (the
// other samples are already there; the review is the one being recorded);
// `from` seeks there once recording starts (seconds); `speed` is the replay
// rate; `start=click` waits for Record to be pressed instead of pressing it;
// `end=hold` keeps recording at the end instead of pressing Stop;
// `edits=0` leaves the voices unnamed after Stop; `profile=empty` starts with
// no conversations at all, as a new install does, so Home and Conversations
// offer the example; `profile=many` holds two hundred synthetic conversations
// in three groups instead of the samples (`many.mjs`), to measure Global
// conversations at size; `theme`, `view` and `flow` as in `settings.mjs`.
// `panel=true` is the app's own: the workspace window.

import mainFixture from "../../src/helpers/sampleConversations/launch-readiness-review.json";
import { installClock } from "./clock.mjs";
import { createFakeMain } from "./fake-main.mjs";
import { installFakeMicrophone } from "./media.mjs";
import { manyConversations } from "./many.mjs";
import { createReplay } from "./replay.mjs";
import { applyDemoSettings } from "./settings.mjs";

const supporting = Object.values(
  import.meta.glob("../fixtures/*.json", { eager: true, import: "default" })
);

const params = new URLSearchParams(window.location.search);
const live = params.get("demo") === "live";
const empty = params.get("profile") === "empty";
const many = params.get("profile") === "many";

installClock();
applyDemoSettings(params);
installFakeMicrophone();

const main = createFakeMain({
  fixtures: empty || many ? [] : live ? supporting : [mainFixture, ...supporting],
  example: mainFixture,
  // The demo's conversations stand for somebody's own: no "Example" badge
  // unless `badges=1` asks for it.
  badges: params.get("badges") === "1",
  // The context check's agent (`agent=1`, with `check=1`): see context.mjs.
  agent: params.get("agent") === "1",
});
if (many) {
  // Work and Personal are seeded; Research is one the person made, between them.
  const seeded = Object.fromEntries(main.db.groups.map((group) => [group.seed_key, group]));
  const research = await main.api.createConversationGroup("Research");
  await main.api.reorderConversationGroups([seeded.work.id, research.group.id, seeded.personal.id]);
  const { notes, questions } = manyConversations({
    groups: { work: seeded.work.id, research: research.group.id, personal: seeded.personal.id },
  });
  main.db.notes.push(...notes);
  for (const question of questions) main.insertEvent(question);
}
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
  /** Go to "home", "conversations" or "global" (Global conversations; "map" is its old name). */
  async show(view) {
    if (view === "home") {
      pressButton("Home");
    } else {
      window.dispatchEvent(new Event("oats-show-conversations"));
      await frame();
      window.dispatchEvent(new Event("oats-intelligence-back"));
      await frame();
      pressButton(view === "global" || view === "map" ? "Global" : "List");
    }
    await frame();
  },
  /**
   * Point at a conversation on the Global conversations board, as the pointer
   * would, through the board's own highlight store; `null` points at nothing.
   */
  async point(id) {
    const { useGlobalHighlight } = await import("/components/global/highlightStore.ts");
    const store = useGlobalHighlight.getState();
    if (id === null) store.clear();
    else store.pointAtConversation(id);
    await frame();
  },
  /** The searches the app opened (auto-search with `autosearch=1`), oldest first. */
  searches: () => main.searches.map((search) => ({ ...search })),
  /** The ids of the sample conversations held, newest first. */
  samples: () =>
    main.db.notes
      .filter((note) => note.demo_sample && !note.deleted_at)
      .map((note) => ({ id: note.id, sampleId: note.demo_sample, title: note.title })),
};

await import("/main.jsx");

if (live) {
  const speed = Number(params.get("speed"));
  if (speed > 0) replay.speed(speed);
  const from = Number(params.get("from"));
  if (from > 0) void replay.seek(from);
  if (params.get("start") === "click") {
    // Wait for Record to be pressed, by a person or by the film's director: the
    // app's own button and shortcut start the replay, and pressing again stops
    // it, instead of the page pressing Record as it loads.
    main.api.requestToggleConversation = async () => {
      if (replay.status().phase === "recording") await replay.finish();
      else await replay.play();
    };
  } else {
    void replay.play().catch((error) => console.error(error));
  }
}
