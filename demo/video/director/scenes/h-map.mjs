// Scenes 10-11: List / Map slides to Map; then the sidebar's footer.
import { READY, url } from "./_base.mjs";

export default {
  url: url(),
  cursorStart: { x: 1000, y: 640 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(600);
    await d.record(async () => {
      await d.click("text=Conversations", { duration: 900 });
      await d.wait(1100);
      await d.click("text=Map", { duration: 1000 });
      d.cue("map");
      await d.wait(3600);
      // Beside "On this Mac", pointing at it, not over the field.
      await d.moveTo({ x: 104, y: 790 }, { duration: 1200 });
      d.cue("footer");
      await d.wait(5200);
    });
  },
};
