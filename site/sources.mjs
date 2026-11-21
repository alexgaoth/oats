// The files the site's bundles are built from, and a hash of each set.
// build.mjs writes the hashes beside the bundles, and test/helpers/site.test.js
// checks them, so a change to an input without a rebuild fails the tests
// instead of shipping a stale site.
//
//   site.js — the oat mark, the field and the app's painter (SITE_SOURCES)
//   live.js and live.css — the live figures: every module site/src/live.js
//     reaches through its imports (the app's components, their helpers and
//     the example), the styles, and the English strings (liveSources)

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_STRINGS_FILES } from "./live-strings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SITE_SOURCES = [
  "site/src/site.js",
  "site/src/mark.js",
  "site/src/field.js",
  "site/src/download.js",
  "src/components/shell/grainCanvas.ts",
  "src/helpers/oatsMarkMotion.mjs",
  "src/helpers/grainDither.mjs",
];

function hashOf(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file)));
  }
  return hash.digest("hex");
}

export function sourceHash() {
  return hashOf(SITE_SOURCES);
}

/** Comments out first: a JSDoc `import("…")` names a type, not a module. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ENDINGS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

/**
 * Every file `entry` reaches through its value imports (an `import type` is
 * gone once compiled), as paths from the repository root, entry first.
 * Packages (`react`, `lucide-react`) and virtual modules are not followed.
 *
 * @param {string} entry a path from the repository root
 */
export function importGraph(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.endsWith(".json")) return;
    const body = code(fs.readFileSync(path.join(root, file), "utf8"));
    const specs = [
      ...body.matchAll(
        /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm
      ),
      ...body.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;
      const base = path.resolve(path.dirname(path.join(root, file)), spec);
      const found = ENDINGS.map((ending) => base + ending).find(
        (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      );
      if (!found) throw new Error(`${file}: cannot resolve ${spec}`);
      visit(path.relative(root, found).split(path.sep).join("/"));
    }
  };
  visit(entry);
  return [...seen];
}

/** The live figures' script, and the styles live.css is compiled from. */
export const LIVE_ENTRY = "site/src/live.js";
export const LIVE_STYLES = [
  "site/src/live.css",
  "src/styles/oats-tokens.css",
  "src/styles/oats-motion.css",
];

export function liveSources() {
  return [...new Set([...importGraph(LIVE_ENTRY), ...LIVE_STYLES, ...LIVE_STRINGS_FILES])];
}

export function liveSourceHash() {
  return hashOf(liveSources());
}
