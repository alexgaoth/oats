// Scene 4: the first eleven minutes at six times speed, captured lightly: the
// edit plays it faster still, so 15 frames a second is plenty.
import { READY, url } from "./_base.mjs";

export default {
  url: url("demo=live&from=20&speed=6&end=hold"),
  cursorStart: { x: 1500, y: 1100 },
  capture: { quality: 90, everyNthFrame: 4 },
  async run(d) {
    await d.waitFor(READY);
    await d.waitFor("window.oatsDemo.status().phase === 'recording'");
    await d.record(async () => {
      await d.waitFor("window.oatsDemo.status().seconds >= 700", 240000);
    });
  },
};
