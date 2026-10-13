// Scene 5: the room comes back to the launch date and Auto turns the stack into
// a graph (about 12:06). Real time.
import { READY, url } from "./_base.mjs";

export default {
  url: url("demo=live&from=705&end=hold"),
  cursorStart: { x: 1500, y: 1100 },
  async run(d) {
    await d.waitFor(READY);
    await d.waitFor("window.oatsDemo.status().phase === 'recording' && window.oatsDemo.status().seconds >= 705", 60000);
    await d.record(async () => {
      await d.waitFor("window.oatsDemo.status().seconds >= 745", 90000);
    });
  },
};
