const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_NODE_MAJOR = 24;

function getLocalWhisperBinary(platform, arch) {
  const extension = platform === "win32" ? ".exe" : "";
  const supported =
    (platform === "linux" && arch === "x64") ||
    (platform === "darwin" && (arch === "arm64" || arch === "x64")) ||
    (platform === "win32" && arch === "x64");
  return supported ? `resources/bin/whisper-server-${platform}-${arch}${extension}` : null;
}

function inspectSetup({
  rootDir = path.resolve(__dirname, ".."),
  nodeVersion = process.versions.node,
  platform = process.platform,
  arch = process.arch,
  sessionType = process.env.XDG_SESSION_TYPE || "n/a",
  desktop = process.env.XDG_CURRENT_DESKTOP || "n/a",
  existsSync = fs.existsSync,
} = {}) {
  const major = Number.parseInt(String(nodeVersion).split(".")[0], 10);
  const dependencyMarkers = [
    "node_modules/electron/package.json",
    "node_modules/vite/package.json",
    "node_modules/typescript/package.json",
  ];
  const missingDependencies = dependencyMarkers.filter(
    (relativePath) => !existsSync(path.join(rootDir, relativePath))
  );
  const sourceMarkers = [
    "main.js",
    "src/AppRouter.jsx",
    "src/helpers/conversationAide.js",
    "src/helpers/conversationAide.mjs",
  ];
  const missingSource = sourceMarkers.filter(
    (relativePath) => !existsSync(path.join(rootDir, relativePath))
  );
  const localWhisperBinary = getLocalWhisperBinary(platform, arch);
  const hasLocalWhisper =
    localWhisperBinary !== null && existsSync(path.join(rootDir, localWhisperBinary));

  return {
    ready:
      major >= REQUIRED_NODE_MAJOR &&
      missingDependencies.length === 0 &&
      missingSource.length === 0,
    node: {
      version: nodeVersion,
      requiredMajor: REQUIRED_NODE_MAJOR,
      ok: major >= REQUIRED_NODE_MAJOR,
    },
    system: { platform, arch, sessionType, desktop },
    source: { ok: missingSource.length === 0, missing: missingSource },
    dependencies: {
      ok: missingDependencies.length === 0,
      missing: missingDependencies,
    },
    localWhisper: {
      supported: localWhisperBinary !== null,
      present: hasLocalWhisper,
      binary: localWhisperBinary,
    },
  };
}

function formatSetupReport(report) {
  const line = (ok, label, detail) => `${ok ? "[ok]" : "[needs setup]"} ${label}: ${detail}`;
  const output = [
    "Oats first-setup check",
    "======================",
    line(report.node.ok, "Node", `${report.node.version} (requires ${report.node.requiredMajor}+)`),
    line(
      report.source.ok,
      "Source tree",
      report.source.ok ? "complete" : `missing ${report.source.missing.join(", ")}`
    ),
    line(
      report.dependencies.ok,
      "JavaScript dependencies",
      report.dependencies.ok ? "installed" : `missing ${report.dependencies.missing.join(", ")}`
    ),
    `[info] Platform: ${report.system.platform}/${report.system.arch}`,
  ];
  if (report.system.platform === "linux") {
    output.push(
      `[info] Linux session: ${report.system.sessionType}; desktop: ${report.system.desktop}`
    );
  }
  output.push(
    report.localWhisper.supported
      ? line(
          report.localWhisper.present,
          "Local Whisper helper",
          report.localWhisper.present
            ? report.localWhisper.binary
            : `missing ${report.localWhisper.binary}`
        )
      : `[info] Local Whisper helper: no prebuilt binary for ${report.system.platform}/${report.system.arch}`,
    ""
  );

  if (report.ready) {
    output.push("Ready for development.");
    if (report.localWhisper.supported && !report.localWhisper.present) {
      output.push(
        "Local Whisper is not ready yet.",
        "When GitHub download access is available: npm run setup:local-whisper",
        "Cloud transcription and other development features can still run without it."
      );
    }
    output.push("Next: npm run dev", "Feature tests: npm run test:oats");
  } else {
    output.push("Setup is incomplete.");
    if (!report.node.ok) output.push(`1. Install and select Node ${report.node.requiredMajor}.`);
    if (!report.dependencies.ok) {
      output.push(
        "2. When registry access is available, run: npm ci",
        "   A restricted network may prevent Electron/native helper downloads; retry later without deleting the source tree."
      );
    }
    output.push("3. Re-run: npm run setup:check");
  }
  return output.join("\n");
}

if (require.main === module) {
  const report = inspectSetup();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else console.log(formatSetupReport(report));
  if (!report.ready) process.exitCode = 1;
}

module.exports = {
  REQUIRED_NODE_MAJOR,
  formatSetupReport,
  getLocalWhisperBinary,
  inspectSetup,
};
