// Scene 8: the finished review opened from Recent, read top to bottom.
import { READY, url } from "./_base.mjs";

export default {
  url: url(),
  cursorStart: { x: 700, y: 600 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(800);
    await d.record(async () => {
      await d.wait(500);
      await d.click("text=Enterprise launch review: SSO gates the date", { duration: 1000 });
      d.cue("opened");
      await d.wait(1500);
      await d.rect("header", "h1");
      await d.rect("shape", "text=Answered", { closest: "[data-slot=card]" });
      await d.moveTo({ x: 820, y: 560 }, { duration: 700 });
      await d.scroll(520, { duration: 2600 });
      await d.wait(900);
      await d.scroll(640, { duration: 2800 });
      await d.wait(1500);
    });
  },
};
