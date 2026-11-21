const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "../..");
const SITE = path.join(ROOT, "site");
const HTML = fs.readFileSync(path.join(SITE, "index.html"), "utf8");

// The site serves a committed bundle (no build on the host), so a change to the
// mark, the field or the app's painter must come with a rebuild.
test("the site's script is built from the current sources", async () => {
  const { sourceHash } = await import(pathToFileURL(path.join(SITE, "sources.mjs")).href);
  const recorded = fs.readFileSync(path.join(SITE, "assets/site.js.sources"), "utf8").trim();
  assert.equal(recorded, sourceHash(), "site/assets/site.js is stale: run npm run build:site");
});

// The buttons link to releases/latest/download/<name>, so the names must be the
// ones the release job publishes, in every version.
test("the download buttons use the names the release job publishes", () => {
  const download = fs.readFileSync(path.join(SITE, "src/download.js"), "utf8");
  const workflow = fs.readFileSync(
    path.join(ROOT, ".github/workflows/build-and-notarize.yml"),
    "utf8"
  );
  for (const name of ["Oats-arm64.dmg", "Oats-x64.dmg"]) {
    assert.match(download, new RegExp(`/latest/download/${name.replace(".", "\\.")}`));
    assert.match(
      workflow,
      new RegExp(`\\b${name.replace(".", "\\.")}\\b`),
      `the release job publishes ${name}`
    );
  }
});

test("the page names the version in package.json", () => {
  const { version } = require(path.join(ROOT, "package.json"));
  const named = [...HTML.matchAll(/Version (\d+\.\d+\.\d+)/g)].map((match) => match[1]);
  assert.ok(named.length > 0);
  for (const value of named) assert.equal(value, version);
});

test("every file the page uses is in site/", () => {
  const references = new Set();
  for (const [, value] of HTML.matchAll(/(?:src|href|poster)="([^"#:]+)"/g)) references.add(value);
  for (const [, list] of HTML.matchAll(/srcset="([^"]+)"/g)) {
    for (const entry of list.split(",")) references.add(entry.trim().split(/\s+/)[0]);
  }
  const css = fs.readFileSync(path.join(SITE, "assets/site.css"), "utf8");
  for (const [, value] of css.matchAll(/url\("([^"]+)"\)/g))
    references.add(path.posix.join("assets", value));
  assert.ok(references.size > 10);
  for (const reference of references) {
    assert.ok(fs.existsSync(path.join(SITE, reference)), `missing: site/${reference}`);
  }
});

test("every image says what it shows and keeps its space", () => {
  const images = [...HTML.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(images.length > 0);
  for (const image of images) {
    assert.match(image, /\balt="[^"]{12,}"/, image);
    assert.match(image, /\bwidth="\d+"/, image);
    assert.match(image, /\bheight="\d+"/, image);
  }
  // The product loops have no sound, so their description is their label, and
  // their poster is what reduced motion shows.
  const loops = [...HTML.matchAll(/<video\b[^>]*\bdata-loop\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(loops.length > 0);
  for (const loop of loops) {
    assert.match(loop, /\baria-label="[^"]{12,}"/, loop);
    assert.match(loop, /\bposter="media\/[^"]+"/, loop);
    assert.match(loop, /\bmuted\b/, loop);
    assert.match(loop, /\bwidth="\d+"/, loop);
    assert.match(loop, /\bheight="\d+"/, loop);
  }
});

// The figures the app's own components will replace, live, keep a stable hook,
// with the still or the loop inside as what shows until then.
test("the live slots are figures with their media inside", () => {
  for (const slot of ["hero", "map", "topics", "questions", "after"]) {
    const figure = new RegExp(
      `<figure\\b[^>]*\\bdata-live-slot="${slot}"[^>]*>([\\s\\S]*?)</figure>`
    ).exec(HTML);
    assert.ok(figure, `a figure with data-live-slot="${slot}"`);
    assert.match(figure[1], /<(?:img|video)\b/, `the ${slot} slot keeps its media`);
  }
});

// media/manifest.json says what each file shows and how it was made; its sizes
// tell when a file changed without the manifest.
test("the media manifest lists every file at its size", () => {
  const media = path.join(SITE, "media");
  const { files } = JSON.parse(fs.readFileSync(path.join(media, "manifest.json"), "utf8"));
  const listed = new Map(files.map((entry) => [entry.name, entry]));
  for (const name of fs.readdirSync(media)) {
    if (name === "manifest.json") continue;
    assert.ok(listed.has(name), `site/media/${name} is in the manifest`);
    assert.equal(listed.get(name).bytes, fs.statSync(path.join(media, name)).size, name);
  }
  for (const entry of files) {
    assert.ok(fs.existsSync(path.join(media, entry.name)), `missing: site/media/${entry.name}`);
    assert.match(entry.alt ?? "", /.{12,}/, `${entry.name} has an alt text`);
  }
});

// DESIGN.md §8: no em or en dash, and no exclamation mark, in visible English.
// The page keeps its script and styles in files, so everything after the
// doctype is markup or words a reader sees (text, alt, labels, titles).
test("the page's English follows the voice rules", () => {
  const page = HTML.slice(HTML.indexOf("<html"));
  assert.doesNotMatch(page, /[\u2013\u2014]/, "an em or en dash");
  assert.doesNotMatch(page, /!/, "an exclamation mark");
  assert.doesNotMatch(page, /AI-powered|nothing leaves your Mac/i);
});

// The page makes no request to another site until someone downloads: its
// fonts, script and media are its own.
test("the page loads nothing from other sites", () => {
  for (const [tag] of HTML.matchAll(/<(?:script|link|img|source|video)\b[^>]*>/gi)) {
    if (/rel="canonical"/.test(tag)) continue;
    assert.doesNotMatch(tag, /\b(?:src|href|poster|srcset)="https?:/, tag);
  }
  const css = fs.readFileSync(path.join(SITE, "assets/site.css"), "utf8");
  assert.doesNotMatch(css, /url\(["']?https?:/);
});

// The live figures (site/src/live.js): the app's own components on the example
// conversation, in the figures that carry data-live-slot. A committed bundle,
// like site.js, so a change to a component they draw must come with a rebuild.
test("the live figures are built from the current sources", async () => {
  const { liveSourceHash } = await import(pathToFileURL(path.join(SITE, "sources.mjs")).href);
  const recorded = fs.readFileSync(path.join(SITE, "assets/live.js.sources"), "utf8").trim();
  assert.equal(recorded, liveSourceHash(), "site/assets/live.js is stale: run npm run build:site");
});

test("the live figures stay small, and ask nothing of another site", () => {
  const zlib = require("zlib");
  const js = fs.readFileSync(path.join(SITE, "assets/live.js"));
  const css = fs.readFileSync(path.join(SITE, "assets/live.css"));
  const gzipped = zlib.gzipSync(js, { level: 9 }).length + zlib.gzipSync(css, { level: 9 }).length;
  assert.ok(
    gzipped < 250 * 1024,
    `live.js and live.css are ${Math.round(gzipped / 1024)} KB gzipped`
  );
  const code = js.toString();
  assert.doesNotMatch(
    code,
    /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|electronAPI/
  );
  // The page's Content-Security-Policy allows no eval and no inline style.
  assert.doesNotMatch(code, /\beval\(|new Function\(/);
  const styles = css.toString();
  assert.doesNotMatch(styles, /@import|url\(["']?https?:/);
  // A shadow root ignores @property, so live.js registers them instead.
  assert.doesNotMatch(styles, /@property/);
  assert.match(code, /registerProperty/);
});

test("the live figures read no store and reach nothing outside the page", async () => {
  const { importGraph, LIVE_ENTRY } = await import(
    pathToFileURL(path.join(SITE, "sources.mjs")).href
  );
  const files = importGraph(LIVE_ENTRY);
  for (const piece of ["DemoReplay", "DemoFlow", "DemoQuestions", "DemoOpen", "DemoVoices"]) {
    assert.ok(files.includes(`src/components/demo/${piece}.tsx`), `live.js draws ${piece}`);
  }
  assert.deepEqual(
    files.filter((file) =>
      /src\/stores\/|OatsWorkspace\.tsx|LiveSignalRail|LiveConversationFlow|useLiveContour/.test(
        file
      )
    ),
    []
  );
  const code = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const reaching =
    /electronAPI|localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|window\.open\(|location\.(href|assign|replace)/;
  const leaks = files
    .filter((file) => !file.endsWith(".json"))
    .filter((file) => reaching.test(code(fs.readFileSync(path.join(ROOT, file), "utf8"))));
  assert.deepEqual(leaks, []);
});

test("every string the live figures name is in the English they carry", async () => {
  const { importGraph, LIVE_ENTRY } = await import(
    pathToFileURL(path.join(SITE, "sources.mjs")).href
  );
  const { liveStrings } = await import(pathToFileURL(path.join(SITE, "live-strings.mjs")).href);
  const strings = liveStrings();
  const at = (key) => key.split(".").reduce((node, part) => node?.[part], strings);
  const named = new Set();
  const prefixes = new Set();
  for (const file of importGraph(LIVE_ENTRY).filter((name) => !name.endsWith(".json"))) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const [, key] of source.matchAll(
      /["'`]((?:oats|questionCard|topicGraph|demo)\.[A-Za-z0-9_.]+)["'`]/g
    )) {
      named.add(key);
    }
    for (const [, prefix] of source.matchAll(
      /`((?:oats|questionCard|topicGraph|demo)\.[A-Za-z0-9_.]+\.)\$\{/g
    )) {
      prefixes.add(prefix.slice(0, -1));
    }
  }
  assert.ok(named.size > 40);
  for (const key of named) {
    const found = at(key) ?? at(`${key}_one`) ?? strings[key];
    const plural = Object.keys(at(key.split(".").slice(0, -1).join(".")) ?? {}).some((name) =>
      name.startsWith(`${key.split(".").pop()}_`)
    );
    assert.ok(found !== undefined || plural, `the live figures' English has ${key}`);
  }
  for (const prefix of prefixes) {
    assert.equal(typeof at(prefix), "object", `the live figures' English has ${prefix}.*`);
  }
});

test("a live figure loads as it nears the screen, in a box its component's size", () => {
  const site = fs.readFileSync(path.join(SITE, "src/site.js"), "utf8");
  const css = fs.readFileSync(path.join(SITE, "assets/site.css"), "utf8");
  // Not with the page: site.js loads live.js when a figure nears the screen.
  assert.doesNotMatch(HTML, /live\.js|live\.css/);
  assert.match(site, /const LIVE_SCRIPT = "live\.js";/);
  assert.match(
    site,
    /import\(\/\* @vite-ignore \*\/ new URL\(LIVE_SCRIPT, import\.meta\.url\)\.href\)/
  );
  assert.match(site, /approaching\.observe\(figure\)/);
  // A loop in a live figure never fetches its film; if the figure cannot be
  // drawn, it plays like the others.
  assert.match(site, /if \(!video\.closest\("\[data-live-slot\]"\)\) wireLoop\(video\);/);
  assert.match(site, /function keepStill\(figure\) \{\s*figure\.dataset\.live = "failed";/);
  // With scripts on, each figure is its component's height from the first
  // paint (the measured table), so nothing moves when it arrives.
  const scripted = css.slice(css.indexOf("@media (scripting: enabled) {"));
  assert.match(
    scripted,
    /\/\* live-heights:start \*\/\n {2}:root \{ --live-map: \d+px; --live-topics: \d+px; --live-questions: \d+px; --live-after: \d+px; \}/
  );
  assert.match(scripted, /\/\* live-heights:end \*\//);
  for (const slot of ["hero", "map", "topics", "questions", "after"]) {
    assert.match(css, new RegExp(`\\[data-live-slot="${slot}"\\]`), `${slot} has its height`);
  }
  assert.match(css, /\[data-live="ready"\] > img,\s*\[data-live="ready"\] > video,/);
});
