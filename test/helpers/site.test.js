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
  const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/build-and-notarize.yml"), "utf8");
  for (const name of ["Oats-arm64.dmg", "Oats-x64.dmg"]) {
    assert.match(download, new RegExp(`/latest/download/${name.replace(".", "\\.")}`));
    assert.match(workflow, new RegExp(`\\b${name.replace(".", "\\.")}\\b`), `the release job publishes ${name}`);
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
  for (const [, value] of css.matchAll(/url\("([^"]+)"\)/g)) references.add(path.posix.join("assets", value));
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
