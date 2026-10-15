// Scene 4: the conversation from 0:20 to 17:36 at six times speed, every
// topic and every return to an earlier one, up to where Words is chosen (the
// d-questions take starts at 17:32). The edit runs it as one time-lapse.
//
// At six times the app pauses for 100-300 ms about once a second (a turn's
// work arrives six times as often). Filmed at a third of real speed, a pause
// is under 100 ms of page time; every second screen frame is plenty.
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
      await d.waitFor("window.oatsDemo.status().seconds >= 1056", 600000);
    });
  },
};
