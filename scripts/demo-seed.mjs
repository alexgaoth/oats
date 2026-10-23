#!/usr/bin/env node
// Seeds the sample conversations into a demo Oats profile, through the app's
// own DatabaseManager (so the schema and every migration are the app's) and
// `insertSampleConversations` (the same function the app uses for its
// in-app example).
//
//   npm run demo:seed -- --profile ~/oats-demo-profile
//   npm run demo:seed -- --profile ~/oats-demo-profile --reset
//   npm run demo:seed -- --profile ~/oats-demo-profile --only-main --dev
//
//   --profile <dir>  the userData directory to write (required)
//   --dev            write transcriptions-dev.db (what `npm run dev` opens)
//                    instead of transcriptions.db (a packaged app)
//   --only-main      the launch review only, as the app ships it
//   --reset          take out every sample first, then insert again
//
// It refuses Oats' real profile, and any existing directory it did not create
// itself: a seeded profile carries `oats-demo-profile.json`, and only such a
// directory, or an empty or new one, is ever written.
//
// better-sqlite3 is built for Electron, so this runs on Electron's Node
// (`ELECTRON_RUN_AS_NODE=1`, as `npm run test:oats:db` does). No window opens
// and nothing touches audio.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "oats-demo-profile.json";

function fail(message) {
  console.error(`demo-seed: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { profile: null, dev: false, onlyMain: false, reset: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--profile") args.profile = argv[(index += 1)];
    else if (arg.startsWith("--profile=")) args.profile = arg.slice("--profile=".length);
    else if (arg === "--dev") args.dev = true;
    else if (arg === "--only-main") args.onlyMain = true;
    else if (arg === "--reset") args.reset = true;
    else fail(`unknown option ${arg}`);
  }
  if (!args.profile) fail("pass --profile <dir>, a directory for the demo profile");
  return args;
}

function expandHome(value) {
  return value === "~" || value.startsWith("~/") ? path.join(os.homedir(), value.slice(1)) : value;
}

/** The path with every existing part resolved through symlinks. */
function realish(target) {
  let existing = target;
  const rest = [];
  while (!fs.existsSync(existing)) {
    rest.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...rest);
}

/** Oats' real profile on each platform: the production channel's userData. */
function realProfiles() {
  const home = os.homedir();
  return [
    path.join(home, "Library", "Application Support", "oats"),
    path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "oats"),
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "oats"),
  ];
}

function assertSafeProfile(profile) {
  const resolved = realish(path.resolve(profile));
  // macOS and Windows file systems ignore case by default: "Oats" is "oats".
  const fold = (value) => (process.platform === "linux" ? value : value.toLowerCase());
  for (const real of realProfiles()) {
    const target = fold(resolved);
    const forbidden = fold(realish(real));
    if (target === forbidden || target.startsWith(forbidden + path.sep)) {
      fail(`refusing ${resolved}: that is Oats' real profile`);
    }
  }
  if (fs.existsSync(resolved)) {
    if (!fs.statSync(resolved).isDirectory()) fail(`${resolved} is not a directory`);
    const entries = fs.readdirSync(resolved).filter((name) => name !== ".DS_Store");
    if (entries.length && !entries.includes(MARKER)) {
      fail(`refusing ${resolved}: it is not empty and was not made by this script (no ${MARKER})`);
    }
  }
  return resolved;
}

function readFixtures({ onlyMain }) {
  const main = path.join(root, "src/helpers/sampleConversations/launch-readiness-review.json");
  const files = [main];
  if (!onlyMain) {
    const dir = path.join(root, "demo/fixtures");
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith(".json")) files.push(path.join(dir, name));
    }
  }
  return files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = assertSafeProfile(expandHome(args.profile));
  fs.mkdirSync(profile, { recursive: true });

  // database.js reads its directory from Electron's `app` and its file name
  // from NODE_ENV, so both are set before it loads.
  process.env.NODE_ENV = args.dev ? "development" : "production";
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: {
          getPath: () => profile,
          getAppPath: () => root,
          isReady: () => false,
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let DatabaseManager;
  try {
    DatabaseManager = require(path.join(root, "src/helpers/database.js"));
  } catch (error) {
    if (/NODE_MODULE_VERSION|ERR_DLOPEN_FAILED/.test(String(error?.message))) {
      fail(
        "better-sqlite3 is built for Electron. Run this with: npm run demo:seed -- --profile <dir>"
      );
    }
    throw error;
  }
  const { insertSampleConversations, removeSampleConversations } = await import(
    pathToFileURL(path.join(root, "src/helpers/sampleConversations.mjs")).href
  );

  const fixtures = readFixtures(args);
  const databaseManager = new DatabaseManager();
  try {
    if (args.reset) {
      const { removed } = removeSampleConversations(databaseManager);
      if (removed) console.log(`Removed ${removed} sample conversation(s).`);
    }
    const results = insertSampleConversations(databaseManager, fixtures, { now: Date.now() });
    fs.writeFileSync(
      path.join(profile, MARKER),
      `${JSON.stringify(
        {
          note: "A demo Oats profile written by scripts/demo-seed.mjs. Every conversation in it is a fictional sample.",
          seededAt: new Date().toISOString(),
          database: args.dev ? "transcriptions-dev.db" : "transcriptions.db",
          samples: results.map(({ sampleId, noteId }) => ({ sampleId, noteId })),
        },
        null,
        2
      )}\n`
    );
    const dbFile = path.join(profile, args.dev ? "transcriptions-dev.db" : "transcriptions.db");
    for (const result of results) {
      console.log(
        `${result.inserted ? "inserted" : "already there"}  #${result.noteId}  ${result.sampleId}  ${
          result.note?.title ?? ""
        }`
      );
    }
    console.log(`\n${results.length} sample conversation(s) in ${dbFile}`);
  } finally {
    databaseManager.db?.close();
  }
}

await main();
