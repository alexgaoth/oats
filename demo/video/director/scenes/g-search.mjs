// Scene 9: "/" opens search; "import bug" is typed; results arrive with the count
// of matches and how long the search took.
import { READY, url } from "./_base.mjs";

export default {
  url: url(),
  cursorStart: { x: 1100, y: 640 },
  // Real time: the results line shows how long the search took, measured.
  capture: { slow: 1 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(800);
    await d.record(async () => {
      await d.wait(600);
      await d.click("text=Search/", { duration: 900 });
      d.cue("search");
      await d.wait(700);
      await d.type("import bug", { perChar: 85 });
      d.cue("typed");
      await d.wait(900);
      await d.rect("field", "input", { pad: 16 });
      await d.wait(5600);
    });
  },
};
