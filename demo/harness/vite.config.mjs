// The demo harness's dev server: the renderer's own Vite config (same React and
// Tailwind plugins, same root), plus one page, /demo.html, that installs a fake
// main process before the app loads.
//
//   npm run demo:harness                 then open http://127.0.0.1:5391/demo.html?panel=true
//   npm run demo:harness -- --port 5300
//
// Dev-only. `npm run build:renderer` uses src/vite.config.mjs, whose one input is
// src/index.html, so nothing under demo/ reaches the packaged app.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import appConfig from "../../src/vite.config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

/** The page: the app's own shell, with the fake main process booted first. */
function demoPage() {
  const boot = `/@fs/${path.join(here, "boot.mjs").replace(/^\/+/, "")}`;
  const page = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Oats</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${boot}"></script>
  </body>
</html>
`;
  return {
    name: "oats-demo-page",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { pathname } = new URL(req.url ?? "/", "http://localhost");
        if (pathname !== "/demo.html") return next();
        try {
          const html = await server.transformIndexHtml(req.url, page);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(async (env) => {
  const base = typeof appConfig === "function" ? await appConfig(env) : appConfig;
  return mergeConfig(base, {
    root: path.join(repo, "src"),
    plugins: [demoPage()],
    server: {
      port: 5391,
      strictPort: false,
      host: "127.0.0.1",
      fs: { allow: [repo] },
    },
  });
});
