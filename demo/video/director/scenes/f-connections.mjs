// The finished review's Connections tab: each question on the topic it was asked
// in; SOC audit is chosen, and its two open questions are listed below.
import { READY, url } from "./_base.mjs";

export default {
  url: url(),
  cursorStart: { x: 700, y: 600 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(800);
    await d.eval("window.oatsDemo.open()");
    await d.waitFor("document.querySelector('[role=tab]')");
    await d.wait(700);
    await d.record(async () => {
      await d.wait(400);
      // The tabs sit under the contour: scroll them up first, as a reader would.
      await d.moveTo({ x: 820, y: 560 }, { duration: 700 });
      const tabs = await d.eval("document.querySelector('[role=tablist]').getBoundingClientRect().top");
      await d.scroll(Math.max(0, tabs - 96), { duration: 1400 });
      await d.wait(300);
      await d.click("text=Connections", { duration: 900 });
      d.cue("connections");
      await d.wait(1500);
      await d.rect("lanes", "[role=tabpanel][data-state=active]");
      await d.click("text=soc audit", { duration: 1100 });
      d.cue("soc");
      await d.wait(3800);
    });
  },
};
