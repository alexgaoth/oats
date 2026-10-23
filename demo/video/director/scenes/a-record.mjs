// Scenes 2-3: Home with last week's conversations; New recording is pressed; the
// sidebar steps aside, the clock starts, and soon after the replay speeds up
// to six times, smoothly, so the film can pass into the time-lapse.
import { READY, url } from "./_base.mjs";

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default {
  url: url("demo=live&start=click&end=hold"),
  cursorStart: { x: 760, y: 560 },
  // Starting a recording is heavy for a moment (about 70 ms of real time);
  // at a quarter of real speed that is one frame of the glide, not four.
  capture: { slow: 4 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(1200);
    await d.record(async () => {
      await d.wait(1600);
      await d.moveTo("text=New recording", { duration: 1100 });
      await d.wait(350);
      await d.click();
      d.cue("recording");
      // Out of the way of the glide, and of the clock.
      await d.moveTo({ x: 1180, y: 700 }, { duration: 800 });
      d.cue("fast");
      for (let step = 1; step <= 16; step += 1) {
        await d.eval(`window.oatsDemo.speed(${1 + 5 * easeInOut(step / 16)})`);
        await d.wait(45);
      }
      d.cue("fast-end");
      await d.rect("status", "text=Recording", { closest: "[data-slot=card]" });
      await d.rect("flow", "text=Conversation flow", { closest: "[data-slot=card]" });
      await d.wait(4200);
    });
  },
};
