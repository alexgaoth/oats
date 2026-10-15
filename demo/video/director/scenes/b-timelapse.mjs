// Scene 4: the first eleven minutes at six times speed (the film uses up to
// about 10:33). At six times the app pauses
// for 100-300 ms about once a second (a turn's work arrives six times as
// often), and at ten times in the film each pause was a held frame. Filmed at
// a third of real speed, a pause is under 100 ms of page time, shorter than
// one film frame at ten times; every second screen frame is plenty.
import { READY, url } from "./_base.mjs";

export default {
  url: url("demo=live&from=20&speed=6&end=hold"),
  cursorStart: { x: 1500, y: 1100 },
  capture: { quality: 90, slow: 3, everyNthFrame: 2 },
  async run(d) {
    await d.waitFor(READY);
    await d.waitFor("window.oatsDemo.status().phase === 'recording'");
    await d.record(async () => {
      // After the sidebar has stepped aside, so the cards are where they stay.
      await d.wait(2500);
      await d.rect("status", "text=Recording", { closest: "[data-slot=card]" });
      await d.rect("flow", "text=Conversation flow", { closest: "[data-slot=card]" });
      // A margin past what the film uses, so the edit can run longer.
      await d.waitFor("window.oatsDemo.status().seconds >= 665", 300000);
    });
  },
};
