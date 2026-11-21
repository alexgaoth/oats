// Builds the site's scripts and records a hash of every input beside each, so
// a test can tell when a committed bundle is stale (test/helpers/site.test.js).
//
//   site/assets/site.js   site/src/site.js with the app's brand modules
//   site/assets/live.js   the live figures (site/src/live.js): React, the
//                         app's components and the example conversation
//   site/assets/live.css  their styles: Tailwind cut to the classes they use
//
//   npm run build:site
//
// The site itself needs no build on the host: site/ is served as it is.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { LIVE_ENTRY, importGraph, liveSourceHash, sourceHash } from "./sources.mjs";
import { liveStrings } from "./live-strings.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const assets = path.join(here, "assets");

await build({
  configFile: false,
  root: here,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir: assets,
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: path.join(here, "src/site.js"),
      formats: ["es"],
      fileName: () => "site.js",
    },
  },
});
fs.writeFileSync(path.join(assets, "site.js.sources"), `${sourceHash()}\n`);

// Their styles: live.css compiled with Tailwind, its classes found in exactly
// the files live.js imports.
const styles = path.join(here, "src/live.css");
const compiler = await compile(fs.readFileSync(styles, "utf8"), {
  base: path.dirname(styles),
  onDependency: () => {},
});
const scanner = new Scanner({
  sources: importGraph(LIVE_ENTRY)
    .filter((file) => /\.(tsx?|jsx?|mjs)$/.test(file))
    .map((file) => ({
      base: path.join(root, path.dirname(file)),
      pattern: path.basename(file),
      negated: false,
    })),
});
const compiled = compiler.build(scanner.scan());

// Tailwind gives its own variables initial values with @property rules, and a
// browser ignores those inside a shadow root: borders, rings and shadows came
// out missing. So they are taken out of the styles here and live.js
// registers the same properties for the page (CSS.registerProperty).
const properties = [];
const unregistered = compiled.replace(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g, (_, name, body) => {
  const field = (key) => new RegExp(`${key}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim();
  const syntax = field("syntax")?.replace(/^"|"$/g, "") ?? "*";
  const initialValue = field("initial-value");
  properties.push({
    name,
    syntax,
    inherits: field("inherits") === "true",
    ...(initialValue !== undefined ? { initialValue } : {}),
  });
  return "";
});
fs.writeFileSync(path.join(assets, "live.css"), optimize(unregistered, { minify: true }).code);

// The live figures. `virtual:live-strings` is the part of the English the
// components name (live-strings.mjs), so the page does not carry the rest;
// `virtual:live-properties` is the styles' registered properties (above).
const strings = liveStrings();
await build({
  configFile: false,
  root: here,
  publicDir: false,
  logLevel: "warn",
  plugins: [
    react(),
    {
      name: "live-data",
      resolveId: (id) =>
        id === "virtual:live-strings" || id === "virtual:live-properties" ? `\0${id}` : null,
      load: (id) =>
        id === "\0virtual:live-strings"
          ? `export default ${JSON.stringify(strings)};`
          : id === "\0virtual:live-properties"
            ? `export default ${JSON.stringify(properties)};`
            : null,
    },
  ],
  // React reads this as it runs; a library build leaves it to the page.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: assets,
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: path.join(root, LIVE_ENTRY),
      formats: ["es"],
      fileName: () => "live.js",
    },
  },
});

fs.writeFileSync(path.join(assets, "live.js.sources"), `${liveSourceHash()}\n`);

const gzip = (file) => zlib.gzipSync(fs.readFileSync(path.join(assets, file)), { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `site: built assets/site.js, live.js (${kb(gzip("live.js"))} gzip) and live.css (${kb(gzip("live.css"))} gzip)`
);
