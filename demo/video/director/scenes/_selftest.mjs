// A self-test for the director: a switch whose honey indicator slides, and a field.
const html = `<!doctype html><html><head><style>
  body { font: 16px Inter, system-ui; background: #fafaf9; display: grid; place-items: center; height: 100vh; margin: 0; }
  .sw { position: relative; display: inline-flex; background: #eee; border-radius: 10px; padding: 4px; gap: 4px; }
  .sw button { position: relative; z-index: 1; border: 0; background: none; padding: 10px 22px; font: inherit; cursor: pointer; }
  .ind { position: absolute; top: 4px; bottom: 4px; left: 4px; width: 90px; background: #f5a30f; border-radius: 7px; transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
  input { margin-top: 24px; font: inherit; padding: 10px; width: 280px; }
</style></head><body><div><div class="sw"><span class="ind" id="ind"></span>
<button id="a" onclick="ind.style.transform='translateX(0)'">List</button>
<button id="b" onclick="ind.style.transform='translateX(98px)'">Map</button></div><br><input id="q" placeholder="Search"></div></body></html>`;
export default {
  url: "data:text/html;base64," + Buffer.from(html).toString("base64"),
  viewport: { width: 1280, height: 720, scale: 2 },
  async run(d) {
    await d.record(async () => {
      await d.wait(300);
      await d.click("#b", { duration: 700 });
      d.cue("switched");
      await d.wait(500);
      await d.click("#a", { duration: 400 });
      await d.wait(400);
      await d.click("#q", { duration: 500 });
      await d.type("import bug");
      await d.wait(500);
    });
  },
};
