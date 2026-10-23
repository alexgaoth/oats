// Builds the site's one script, site/assets/site.js, from site/src and the
// app's own brand modules, then records a hash of every input beside it, so a
// test can tell when the committed bundle is stale (test/helpers/site.test.js).
//
//   npm run build:site
//
// The site itself needs no build on the host: site/ is served as it is.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { sourceHash } from "./sources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

await build({
  configFile: false,
  root: here,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir: path.join(here, "assets"),
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
fs.writeFileSync(path.join(here, "assets/site.js.sources"), `${sourceHash()}\n`);
console.log("site: built assets/site.js");
