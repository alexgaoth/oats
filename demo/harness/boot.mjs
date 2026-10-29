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
// rate; `end=hold` keeps recording at the end instead of pressing Stop;
// `edits=0` leaves the voices unnamed after Stop; `tier` is the speed check's
// state and `chosen` a speech model the person chose (deviceTier.mjs,
// settings.mjs); `profile=empty` starts with
// no conversations at all, as a new install does, so Home and Conversations
// offer the example; `profile=many` holds two hundred synthetic conversations
// in three groups instead of the samples (`many.mjs`), to measure Global
// conversations at size; `loop=1` makes the writing model OpenAI's, so the
// live topic check runs, against the stand-in in fastModel.mjs, and
// `oatsDemo.openaiRequests()` lists what it was asked; `theme`, `view` and
// `flow` as in `settings.mjs`. `panel=true` is the app's own: the workspace
// window.
//
// Summaries that start by themselves (stores/summaryQueueStore.ts):
// `download=<percent>` holds the local writing model (`writing=`, Qwen3.5 4B
// by default) mid-download there, until `oatsDemo.download()` runs it to the
// end; `bare=<sample id>` or `bare=all` takes the summaries away, as from a
// conversation recorded before any model was ready; `summary=fail` fails every
// summary, `summary=fail-once` the first try of each, and `summary=too-long`
// answers as the server on this Mac does to a conversation over its context.

import mainFixture from "../../src/helpers/sampleConversations/launch-readiness-review.json";
import { installClock } from "./clock.mjs";
import { installFakeOpenAI } from "./fastModel.mjs";
import { createFakeMain } from "./fake-main.mjs";
import { createFakeDeviceTier } from "./deviceTier.mjs";
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

// The local writing model settings.mjs chose, and whether it is still on its way.
const writingModel =
  params.get("writing") && params.get("writing") !== "none"
    ? params.get("writing")
    : "qwen3.5-4b-q4_k_m";
const downloadAt = params.get("loop") === "1" ? null : params.get("download");

const main = createFakeMain({
  fixtures: empty || many ? [] : live ? supporting : [mainFixture, ...supporting],
  example: mainFixture,
  // The demo's conversations stand for somebody's own: no "Example" badge
  // unless `badges=1` asks for it.
  badges: params.get("badges") === "1",
  // The context check's agent (`agent=1`, with `check=1`): see context.mjs.
  agent: params.get("agent") === "1",
  // OpenAI as the writing model (`loop=1`): a key for the stand-in, which
  // never leaves the page.
  openai: params.get("loop") === "1",
  missingModels: downloadAt === null ? [] : [writingModel],
});
if (downloadAt !== null) {
  void main.downloadModel(writingModel, { from: Number(downloadAt) || 0, hold: true });
}
const bare = params.get("bare");
if (bare) {
  for (const note of main.db.notes) {
    if (bare === "all" || note.demo_sample === bare) note.enhanced_content = null;
  }
}
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
// The speed check's report (deviceTier.mjs): `tier=` picks the state.
const deviceTier = createFakeDeviceTier({ state: params.get("tier"), emit: main.emit });
Object.assign(main.api, {
  getArch: deviceTier.getArch,
  getDeviceTier: deviceTier.getDeviceTier,
  startSpeechUpgrade: deviceTier.startSpeechUpgrade,
  cancelSpeechUpgrade: deviceTier.cancelSpeechUpgrade,
});
window.electronAPI = main.api;

const replay = createReplay({
  main,
  fixture: mainFixture,
  options: { hold: params.get("end") === "hold", edits: params.get("edits") !== "0" },
});
const openai =
  params.get("loop") === "1"
    ? installFakeOpenAI({ reason: (request) => main.hooks.reason?.(request) ?? null })
    : null;
// A summary that fails, as a model that stops early does: every time
// (`summary=fail`), or only the first try of each conversation (`fail-once`).
// `summary=too-long` answers as llama-server does to a conversation that does
// not fit its context, through main's error.
const failing = params.get("summary");
const CONTEXT_OVERFLOW = `Inference failed: llama-server returned status 400: ${JSON.stringify({
  error: {
    code: 400,
    message:
      "request (20123 tokens) exceeds the available context size (16384 tokens), try increasing it",
    type: "exceed_context_size_error",
    n_prompt_tokens: 20123,
    n_ctx: 16384,
  },
})}`;
if (failing === "fail" || failing === "fail-once" || failing === "too-long") {
  const answer = main.hooks.reason;
  const tried = new Set();
  main.hooks.reason = (request) => {
    if (/meeting notes assistant/i.test(request.prompt)) {
      if (failing === "too-long") return { error: CONTEXT_OVERFLOW, delayMs: 600 };
      const first = !tried.has(request.text);
      tried.add(request.text);
      if (failing === "fail" || first) {
        return { error: "The model on this Mac stopped before it finished.", delayMs: 1500 };
      }
    }
    return answer?.(request) ?? null;
  };
}

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
  /** What the app asked OpenAI (`loop=1`), oldest first: kind, model and characters quoted. */
  openaiRequests: () => openai?.requests() ?? [],
  /** The searches the app opened (auto-search with `autosearch=1`), oldest first. */
  searches: () => main.searches.map((search) => ({ ...search })),
  /** Put the speed check in another state: see deviceTier.mjs. */
  tier: (state) => deviceTier.set(state),
  /**
   * The local writing model's download: run on from where it is to the end
   * over `ms` (resolves when it lands), or held at `from` with `hold`
   * (resolves at once).
   */
  download: async ({ from, ms = 8000, hold = false } = {}) => {
    const landed = main.downloadModel(writingModel, { from, ms, hold });
    if (!hold) await landed;
  },
  /** The conversations owed a summary, newest first (stores/summaryQueueStore.ts). */
  owed: () => {
    try {
      return JSON.parse(localStorage.getItem("oatsPendingSummaries") || "[]");
    } catch {
      return [];
    }
  },
  /** A conversation as main holds it, by sample id or note id. */
  note: (sampleId) => {
    const note = main.db.noteBySample(sampleId) ?? main.db.findNote(Number(sampleId));
    return note ? { ...note } : null;
  },
  /** Open a Settings page, as any screen can ("models", "recording", ...). */
  async settings(page = "general") {
    window.dispatchEvent(new CustomEvent("oats-open-settings", { detail: page }));
    await frame();
  },
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
  void replay.play().catch((error) => console.error(error));
}
