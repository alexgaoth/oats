const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  REQUIRED_NODE_MAJOR,
  formatSetupReport,
  inspectSetup,
} = require("../../scripts/oats-setup-check");

const allPresent = () => true;

test("setup check accepts the pinned Node version and a complete checkout", () => {
  const report = inspectSetup({
    rootDir: "/repo",
    nodeVersion: `${REQUIRED_NODE_MAJOR}.1.0`,
    platform: "linux",
    arch: "x64",
    sessionType: "wayland",
    desktop: "GNOME",
    existsSync: allPresent,
  });
  assert.equal(report.ready, true);
  assert.match(formatSetupReport(report), /Ready for development/);
  assert.match(formatSetupReport(report), /Linux session: wayland; desktop: GNOME/);
});

test("setup check clearly reports an old Node runtime", () => {
  const report = inspectSetup({
    rootDir: "/repo",
    nodeVersion: "23.9.0",
    existsSync: allPresent,
  });
  assert.equal(report.ready, false);
  assert.match(formatSetupReport(report), /Install and select Node 24/);
});

test("setup check distinguishes missing dependencies from missing source", () => {
  const present = new Set([
    "main.js",
    "src/AppRouter.jsx",
    "src/helpers/conversationAide.js",
    "src/helpers/conversationAide.mjs",
  ]);
  const report = inspectSetup({
    rootDir: "/repo",
    nodeVersion: "24.0.0",
    existsSync: (absolutePath) => present.has(path.relative("/repo", absolutePath)),
  });
  assert.equal(report.source.ok, true);
  assert.equal(report.dependencies.ok, false);
  assert.match(formatSetupReport(report), /restricted network/i);
  assert.match(formatSetupReport(report), /npm ci/);
});

test("setup check identifies a missing platform-specific local Whisper helper", () => {
  const report = inspectSetup({
    rootDir: "/repo",
    nodeVersion: "24.0.0",
    platform: "linux",
    arch: "x64",
    existsSync: (absolutePath) => !absolutePath.endsWith("whisper-server-linux-x64"),
  });

  assert.equal(report.ready, true);
  assert.equal(report.localWhisper.supported, true);
  assert.equal(report.localWhisper.present, false);
  assert.match(formatSetupReport(report), /missing resources\/bin\/whisper-server-linux-x64/);
  assert.match(formatSetupReport(report), /npm run setup:local-whisper/);
  assert.match(formatSetupReport(report), /Cloud transcription.*can still run/);
});

test("setup check does not promise a prebuilt local Whisper helper on unsupported systems", () => {
  const report = inspectSetup({
    rootDir: "/repo",
    nodeVersion: "24.0.0",
    platform: "linux",
    arch: "arm64",
    existsSync: allPresent,
  });

  assert.equal(report.localWhisper.supported, false);
  assert.equal(report.localWhisper.present, false);
  assert.match(formatSetupReport(report), /no prebuilt binary for linux\/arm64/);
});

test("setup check fails closed when the module facade or core is absent", () => {
  const report = inspectSetup({
    rootDir: "/repo",
    nodeVersion: "24.0.0",
    existsSync: (absolutePath) => !absolutePath.endsWith("conversationAide.mjs"),
  });
  assert.equal(report.source.ok, false);
  assert.equal(report.ready, false);
  assert.deepEqual(report.source.missing, ["src/helpers/conversationAide.mjs"]);
});
