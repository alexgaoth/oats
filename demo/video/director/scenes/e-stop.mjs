// Scene 7: the last question (29:07) and Stop with its key; the sidebar comes
// back and the conversation is written up.
import { READY, url } from "./_base.mjs";

export default {
  url: url("demo=live&from=1738&end=hold&view=calm"),
  cursorStart: { x: 1100, y: 640 },
  async run(d) {
    await d.waitFor(READY);
    await d.waitFor("window.oatsDemo.status().phase === 'recording' && window.oatsDemo.status().seconds >= 1738", 60000);
    await d.record(async () => {
      await d.waitFor("window.oatsDemo.status().seconds >= 1750", 60000);
      await d.moveTo('button[aria-label="Finish conversation"]', { duration: 1000 });
      await d.wait(400);
      await d.click();
      d.cue("stopped");
      await d.wait(900);
      await d.moveTo({ x: 1200, y: 760 }, { duration: 900 });
      await d.wait(6500);
    });
  },
};
