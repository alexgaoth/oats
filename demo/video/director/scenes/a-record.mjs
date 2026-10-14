// Scenes 2-3: Home with last week's conversations; New recording is pressed; the
// sidebar steps aside, the clock starts and the dot begins to follow the voices.
import { READY, url } from "./_base.mjs";

export default {
  url: url("demo=live&start=click&end=hold"),
  cursorStart: { x: 760, y: 560 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(1200);
    await d.record(async () => {
      await d.wait(1600);
      await d.moveTo("text=New recording", { duration: 1100 });
      await d.wait(350);
      await d.click();
      d.cue("recording");
      await d.wait(900);
      // Out of the way of the glide, and of the clock.
      await d.moveTo({ x: 1180, y: 700 }, { duration: 900 });
      await d.wait(1600);
      await d.rect("status", "text=Recording", { closest: "[data-slot=card]" });
      await d.rect("flow", "text=Conversation flow", { closest: "[data-slot=card]" });
      await d.wait(4600);
    });
  },
};
