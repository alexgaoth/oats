// Scene 6: Words is chosen; "What's the rollback if the migration fails
// halfway?" is answered, then "How long does the full migration take on
// production?" meets "I don't know". 17:36 to 18:22, real time.
import { READY, url } from "./_base.mjs";

export default {
  url: url("demo=live&from=1052&end=hold&view=calm"),
  cursorStart: { x: 1000, y: 700 },
  async run(d) {
    await d.waitFor(READY);
    await d.waitFor("window.oatsDemo.status().phase === 'recording' && window.oatsDemo.status().seconds >= 1052", 60000);
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
      // Past the "I don't know" (18:17), so the card is seen settling on Unknown.
      await d.waitFor("window.oatsDemo.status().seconds >= 1112", 90000);
    });
  },
};
