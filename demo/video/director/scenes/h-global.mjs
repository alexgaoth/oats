// Global conversations: one conversation pointed at lights in both maps, then a
// subject lights every conversation it came back in, then the Work tab (the
// Personal tab holds two conversations, too few for a graph); last, the
// sidebar's foot (On this Mac, over the field).
import { READY, url } from "./_base.mjs";

/** The hidden button a map keeps for a conversation, found by its label. */
const node = (widget, title) =>
  `js=[...document.querySelectorAll('[data-widget="${widget}"] button')].find((b) => b.textContent.includes(${JSON.stringify(title)}))`;
const chip = (subject) =>
  `js=[...document.querySelectorAll('[data-widget="arcs"] button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(subject)}))`;

export default {
  url: url(),
  cursorStart: { x: 1000, y: 640 },
  async run(d) {
    await d.waitFor(READY);
    await d.wait(600);
    await d.record(async () => {
      await d.click("text=Conversations", { duration: 900 });
      await d.wait(900);
      await d.click("text=Global", { duration: 1000 });
      d.cue("global");
      // The force layout settles before the camera looks closely.
      await d.wait(2400);
      await d.rect("force", '[data-widget="force"]');
      await d.rect("arcs", '[data-widget="arcs"]');
      await d.moveTo(node("arcs", "Design crit"), { duration: 1300 });
      d.cue("hover-arcs");
      await d.wait(2600);
      await d.moveTo(node("force", "Enterprise launch review"), { duration: 1200 });
      d.cue("hover-force");
      await d.wait(2400);
      await d.moveTo(chip("sso saml"), { duration: 1100 });
      d.cue("hover-subject");
      await d.wait(2400);
      await d.click("text=Work", { duration: 1000 });
      d.cue("work");
      await d.wait(2600);
      await d.rect("footer", "text=On this Mac", { pad: 8 });
      await d.moveTo("text=On this Mac", { duration: 1200 });
      d.cue("footer");
      await d.wait(3600);
    });
  },
};
