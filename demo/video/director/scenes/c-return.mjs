// The room comes back to the launch date (about 10:33): the lanes' line climbs
// from SOC audit to the first row. Real time; the edit pushes in on the card.
import { READY, url } from "./_base.mjs";

export default {
  url: url("demo=live&from=600&end=hold"),
  cursorStart: { x: 1500, y: 1100 },
  async run(d) {
    await d.waitFor(READY);
    await d.waitFor("window.oatsDemo.status().phase === 'recording' && window.oatsDemo.status().seconds >= 604", 60000);
    await d.record(async () => {
      await d.rect("status", "text=Recording", { closest: "[data-slot=card]" });
      await d.rect("flow", "text=Conversation flow", { closest: "[data-slot=card]" });
      await d.waitFor("window.oatsDemo.status().seconds >= 652", 90000);
    });
  },
};
