// Scene 6: Words is chosen; "What's the rollback if the migration fails
// halfway?" is answered; then "How long does the full migration take on
// production?" meets "I don't know", and Oats searches the web for it (auto-
// search, `autosearch=1`: the harness writes the search down, and the film
// shows the browser opening at that moment). 17:36 to 18:24, real time.
import { READY, SHEET, url } from "./_base.mjs";

const UNKNOWN = SHEET.unknownQuestion;
const cardShown = `[...document.querySelectorAll("p")].some((p) => p.textContent.trim() === ${JSON.stringify(UNKNOWN)})`;

export default {
  url: url(`demo=live&from=${SHEET.wordsFrom}&end=hold&view=calm&autosearch=1`),
  cursorStart: { x: 1000, y: 700 },
  async run(d) {
    await d.waitFor(READY);
    await d.waitFor(`window.oatsDemo.status().phase === 'recording' && window.oatsDemo.status().seconds >= ${SHEET.wordsFrom}`, 60000);
    await d.record(async () => {
      await d.wait(700);
      await d.moveTo("text=Words", { duration: 900 });
      await d.wait(250);
      await d.click();
      d.cue("words");
      await d.wait(700);
      await d.rect("status", "text=Recording", { closest: "[data-slot=card]" });
      await d.rect("flow", "text=Conversation flow", { closest: "[data-slot=card]" });
      await d.moveTo({ x: 1380, y: 840 }, { duration: 900 });
      // The question's card appears, then the room says it does not know.
      await d.waitFor(cardShown, 90000);
      d.cue("asked");
      // This question's own search (the seek to 17:32 has opened earlier ones).
      const searchedNow = `window.oatsDemo.searches().find((s) => s.query === ${JSON.stringify(UNKNOWN)})`;
      await d.waitFor(searchedNow, 90000);
      const search = await d.eval(searchedNow);
      d.cue("searched", { query: search.query, searchBaseUrl: search.searchBaseUrl });
      await d.wait(6000);
    });
  },
};
