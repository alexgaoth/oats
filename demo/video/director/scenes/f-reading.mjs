// The finished review opened from Recent: its shape (the contour, the
// questions on it, who talked) held long enough to read, then the summary.
import { READY, url } from "./_base.mjs";

export default {
  url: url(),
  cursorStart: { x: 700, y: 600 },
  capture: { slow: 3 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(800);
    await d.record(async () => {
      await d.wait(500);
      await d.click("text=Enterprise launch review: SSO gates the date", { duration: 1000 });
      d.cue("opened");
      await d.wait(900);
      await d.rect("shape", "text=Answered", { closest: "[data-slot=card]" });
      // Out of the card, so the pointer does not draw the hover line on it.
      await d.moveTo({ x: 1330, y: 640 }, { duration: 700 });
      await d.wait(2600);
      d.cue("scroll");
      await d.scroll(560, { duration: 2400 });
      await d.wait(1600);
    });
  },
};
