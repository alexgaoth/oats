// The files site/assets/site.js is built from, and a hash of them. build.mjs
// writes the hash beside the bundle, and test/helpers/site.test.js checks it,
// so a change to the mark, the field or the app's painter without a rebuild
// fails the tests instead of shipping a stale site.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export function sourceHash() {
  const hash = createHash("sha256");
  for (const file of SITE_SOURCES) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file)));
  }
  return hash.digest("hex");
}
