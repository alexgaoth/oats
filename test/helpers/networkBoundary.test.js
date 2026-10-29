const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// What docs/network-allowlist.md promises, pinned where a build or a launch could
// quietly break it: no analytics endpoint, no download nobody asked for (the
// one exception, Whisper Turbo after setup on a fast Mac, is pinned at the
// end), and nothing of the builder's own machine inside the app.

const root = path.join(__dirname, "..", "..");
const builder = JSON.parse(fs.readFileSync(path.join(root, "electron-builder.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("the builder's own .env is never packed into the app", () => {
  const entries = [
    ...(builder.extraResources ?? []),
    ...(builder.mac?.extraResources ?? []),
    ...(builder.linux?.extraResources ?? []),
    ...(builder.files ?? []),
  ];
  for (const entry of entries) {
    const from = typeof entry === "string" ? entry : entry?.from;
    assert.ok(
      !/(^|\/)\.env$/.test(String(from ?? "")),
      `electron-builder ships ${JSON.stringify(entry)}: a builder's .env carries their API keys`
    );
  }
});

test("every platform build bundles the embedding model rather than fetching it at launch", () => {
  for (const script of ["prebuild", "prebuild:mac", "prebuild:linux"]) {
    assert.match(
      pkg.scripts[script] ?? "",
      /download:embedding-model -- --for-build/,
      `${script} must bundle all-MiniLM-L6-v2`
    );
  }
});

test("the build's own pre-hooks are what a mac release runs", () => {
  // npm runs `pre<name>` only for the exact script name. `build:mac` has its
  // prebuild; a release workflow that called `build:mac:arm64` would pack an
  // app with no speech engine and fail nothing. The two arches ship different
  // speech models, so each script also names its arch for that prebuild.
  assert.ok(pkg.scripts["prebuild:mac"], "prebuild:mac exists");
  assert.match(pkg.scripts["build:mac"], /electron-builder --mac/);
  for (const arch of ["arm64", "x64"]) {
    const script = pkg.scripts[`build:mac:${arch}`];
    assert.match(
      script,
      new RegExp(`npm run build:mac -- --${arch}$`),
      `build:mac:${arch} must go through build:mac, so its prebuild runs`
    );
    assert.match(
      script,
      new RegExp(`^cross-env TARGET_ARCH=${arch} `),
      `build:mac:${arch} must name its arch, so its prebuild fetches that arch's speech models`
    );
  }
});

test("the vector store runs on loopback with its telemetry off", () => {
  const { qdrantConfigYaml, qdrantArgs } = require("../../src/helpers/qdrantManager");
  const yaml = qdrantConfigYaml("/tmp/oats-storage", 6333);
  assert.match(yaml, /^telemetry_disabled: true$/m);
  assert.match(yaml, /^ {2}host: 127\.0\.0\.1$/m);
  assert.match(yaml, /^ {2}http_port: 6333$/m);
  assert.match(yaml, /^ {2}grpc_port: 6334$/m);
  assert.deepEqual(qdrantArgs("/tmp/oats-storage/config.yaml"), [
    "--config-path",
    "/tmp/oats-storage/config.yaml",
    "--disable-telemetry",
  ]);
});

// The sidebar's "N network requests since launch" (networkLedger.js) counts at
// the hooks every request passes through. These pin the paths those hooks
// cannot see, so each stays at zero by construction, and the hooks themselves.

function sourcesUnder(dir, pattern) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(path.join(root, current), { withFileTypes: true })) {
      const relative = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["dist", "node_modules", "locales", "assets"].includes(entry.name)) walk(relative);
      } else if (pattern.test(entry.name)) {
        out.push(relative);
      }
    }
  };
  walk(dir);
  return out;
}

const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const MAIN_SOURCES = [
  "main.js",
  "preload.js",
  "src/updater.js",
  ...sourcesUnder("src/helpers", /\.(js|mjs|cjs)$/),
  ...sourcesUnder("src/utils", /\.(js|mjs|cjs)$/),
  ...sourcesUnder("src/workers", /\.(js|mjs|cjs)$/),
];
const ALL_SOURCES = ["main.js", "preload.js", ...sourcesUnder("src", /\.(js|mjs|cjs|jsx|ts|tsx)$/)];

test("the ledger is installed before main.js loads anything that could connect", () => {
  const main = read("main.js");
  const install = main.indexOf('require("./src/helpers/networkLedger").install(');
  assert.ok(install > 0, "main.js installs the ledger");
  // Before it: electron itself, and the Linux relaunch's child_process, which
  // spawns this same app and exits.
  const before = [...main.slice(0, install).matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(before)].sort(), ["child_process", "electron"]);
  assert.ok(install < main.indexOf("app.whenReady()"));
});

test("no main-process code opens a socket, HTTP/2 or UDP connection the hooks cannot see", () => {
  const raw =
    /require\(["'](node:)?(http2|dgram)["']\)|\bnet\.(connect|createConnection)\(|\btls\.connect\(|new net\.Socket\(/;
  for (const file of MAIN_SOURCES) {
    assert.doesNotMatch(read(file), raw, `${file}: a raw connection bypasses networkLedger.js`);
  }
});

test("nothing downloads through session.downloadURL, which webRequest does not see", () => {
  for (const file of MAIN_SOURCES) {
    assert.doesNotMatch(
      read(file),
      /\.downloadURL\(/,
      `${file}: use downloadUtils.js (net.request)`
    );
  }
});

test("webRequest.onSendHeaders is the ledger's alone", () => {
  // Electron keeps one listener per event per session: a second one would
  // silently replace the counter.
  for (const file of ALL_SOURCES) {
    if (file.endsWith(path.join("helpers", "networkLedger.js"))) continue;
    assert.doesNotMatch(read(file), /onSendHeaders/, `${file} would replace the request counter`);
  }
});

test("every shell.openExternal call goes through the counted property", () => {
  for (const file of MAIN_SOURCES) {
    // The ledger itself is what wraps the property.
    if (file.endsWith(path.join("helpers", "networkLedger.js"))) continue;
    const source = read(file);
    assert.doesNotMatch(
      source,
      /\{[^}]*\bopenExternal\b[^}]*\}\s*=\s*(require\(["']electron["']\)\.)?shell\b/,
      file
    );
    assert.doesNotMatch(source, /=\s*shell\.openExternal\b(?!\()/, file);
    assert.doesNotMatch(source, /shell\.openExternal\.(bind|call|apply)\b/, file);
  }
});

test("the Linux new-window search launch counts itself", () => {
  const handlers = read("src/helpers/ipcHandlers.js");
  const launch = handlers.indexOf("newWindowCommand(entry, url)");
  const recorded = handlers.indexOf('getNetworkLedger().recordUrl("browser", url)');
  assert.ok(
    launch > 0 && recorded > launch,
    "the spawned browser is recorded after it is launched"
  );
});

test("the context agent's Claude Code run counts itself, and nothing else starts one", () => {
  // A child process passes none of the ledger's hooks. The runner records
  // Anthropic's API once Claude Code has started, and each service it reads;
  // contextAgentRunner.test.js checks the counts with a fake Claude Code.
  const runner = read("src/helpers/contextAgentRunner.js");
  const launch = runner.indexOf("spawnProcess(binary, agent.buildAgentArgs(");
  const started = runner.indexOf('child.once("spawn"');
  const recorded = runner.indexOf("ledger().recordUrl(LEDGER_SOURCE, ANTHROPIC_API_URL)");
  assert.ok(launch > 0 && started > launch && recorded > started, "recorded once it has started");
  assert.match(runner, /ledger\(\)\.recordHost\(LEDGER_SOURCE, event\.server\)/);
  for (const file of MAIN_SOURCES) {
    if (file.endsWith("contextAgentRunner.js") || file.endsWith("contextAgent.mjs")) continue;
    assert.doesNotMatch(
      read(file),
      /buildAgentArgs/,
      `${file}: start Claude Code through the runner`
    );
  }
});

test("the only utility process is the ONNX worker, and it has no way to the network", () => {
  for (const file of MAIN_SOURCES) {
    if (file.endsWith("onnxWorkerClient.js")) continue;
    assert.doesNotMatch(
      read(file),
      /utilityProcess\.fork\(|new Worker\(|require\(["'](node:)?worker_threads["']\)/,
      `${file}: a new process needs its own count`
    );
  }
  const worker = read("src/workers/onnxWorker.js");
  const required = [...worker.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(required, ["fs", "onnxruntime-node", "os", "path"]);
  assert.doesNotMatch(worker, /\bfetch\(|\bimport\(|electron/);
});

test("the renderer opens no WebRTC connection, which webRequest does not see", () => {
  for (const file of ALL_SOURCES) {
    assert.doesNotMatch(read(file), /RTCPeerConnection/, file);
  }
});

test("llama-server runs offline, so it never fetches a model itself", () => {
  const LlamaServerManager = require("../../src/helpers/llamaServer");
  const saved = process.env.LLAMA_ARG_HF_REPO;
  process.env.LLAMA_ARG_HF_REPO = "someone/some-model-GGUF";
  try {
    const env = new LlamaServerManager()._buildEnv("/opt/oats/bin/llama-server");
    assert.equal(env.LLAMA_ARG_OFFLINE, "1");
  } finally {
    if (saved === undefined) delete process.env.LLAMA_ARG_HF_REPO;
    else process.env.LLAMA_ARG_HF_REPO = saved;
  }
});

test("whisper-server listens on loopback and loads a model file", () => {
  const { buildWhisperServerArgs } = require("../../src/helpers/whisperServer");
  const args = buildWhisperServerArgs({ modelPath: "/models/ggml-base.en.bin", port: 8178 });
  assert.equal(args[args.indexOf("--host") + 1], "127.0.0.1");
  assert.equal(args[args.indexOf("--model") + 1], "/models/ggml-base.en.bin");
  assert.ok(!args.some((arg) => /^(https?|wss?):\/\//.test(String(arg))));
});

// The one download Oats starts by itself: Whisper turbo on a Mac whose GPU
// measured fast enough (speechTier.mjs, deviceTier.js). docs/network-allowlist.md
// names it; these pin how it can start and that it is counted.

test("turbo is fetched only when the workspace asks, after setup, never at launch", () => {
  // Main starts it only from its IPC handler, which the renderer calls.
  for (const file of MAIN_SOURCES) {
    if (file.endsWith(path.join("helpers", "deviceTier.js"))) continue;
    const calls = [...read(file).matchAll(/\.startUpgrade\(/g)].length;
    if (file.endsWith(path.join("helpers", "ipcHandlers.js"))) {
      assert.equal(calls, 1, "ipcHandlers.js starts it from speech-upgrade-start only");
      assert.match(
        read(file),
        /ipcMain\.handle\("speech-upgrade-start"[\s\S]{0,120}startUpgrade\(/
      );
    } else {
      assert.equal(calls, 0, `${file} must not start the turbo download`);
    }
  }
  // The renderer asks from the workspace, which shows only once setup is done.
  const askers = ALL_SOURCES.filter((file) => /\buseSpeechUpgrade\(\);/.test(read(file)));
  assert.deepEqual(askers.map((file) => path.basename(file)).sort(), ["OatsWorkspace.tsx"]);
  assert.match(
    read("src/hooks/useSpeechUpgrade.ts"),
    /setupDone: localStorage\.getItem\("onboardingCompleted"\) === "true"/
  );
});

test("turbo's automatic start is announced where the person is, and only that start", () => {
  // A toast, once, when the workspace's own request started the download
  // (SpeechUpgradeNotice.tsx). Settings' Download button is the person's own
  // request and is not announced.
  const notices = ALL_SOURCES.filter((file) => /<SpeechUpgradeNotice \/>/.test(read(file)));
  assert.deepEqual(
    notices.map((file) => path.basename(file)),
    ["OatsWorkspace.tsx"]
  );
  const autoStarts = ALL_SOURCES.filter((file) => /autoStarted: true/.test(read(file)));
  assert.deepEqual(
    autoStarts.map((file) => path.basename(file)),
    ["useSpeechUpgrade.ts"]
  );
  const notice = read("src/components/SpeechUpgradeNotice.tsx");
  assert.match(notice, /shouldShowUpgradeNotice\(/);
  assert.match(notice, /cancelTurbo\(\)/, "its Cancel is the remembered no");
  assert.match(notice, /oats\.speechTier\.noticeTitle/);
});

test("turbo comes through the counted download path, from the models' own repository", () => {
  const tier = read("src/helpers/deviceTier.js");
  assert.match(tier, /this\.whisperManager\.downloadWhisperModel\(/);
  assert.doesNotMatch(tier, /\bfetch\(|require\(["'](node:)?https?["']\)|\bnet\.request\(/);
  // downloadWhisperModel → downloadUtils.downloadFile → Electron's net.request,
  // which the ledger counts (networkLedger.js).
  assert.match(read("src/helpers/whisper.js"), /await downloadFile\(modelConfig\.url, modelPath/);
  assert.match(
    read("src/helpers/downloadUtils.js"),
    /request = net\.request\(\{ url, method: "GET" \}\)/
  );

  const registry = JSON.parse(read("src/models/modelRegistryData.json"));
  const turbo = registry.whisperModels["turbo-q5"];
  assert.equal(
    turbo.downloadUrl,
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
  );
  assert.match(turbo.sha256, /^[0-9a-f]{64}$/, "checked after the download");
  for (const model of Object.values(registry.whisperModels)) {
    assert.match(
      model.downloadUrl,
      /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\//
    );
  }
});

// The other download Oats starts by itself: the writing model on this Mac,
// when no writing model is ready and the setting follows the default
// (writingTier.mjs, writingModelFetch.js). docs/network-allowlist.md names it.

test("the writing model is fetched only when the renderer asks, never at launch", () => {
  // Main starts it only from its IPC handler.
  for (const file of MAIN_SOURCES) {
    if (file.endsWith(path.join("helpers", "writingModelFetch.js"))) continue;
    const calls = [...read(file).matchAll(/\.writing\.start\(/g)].length;
    if (file.endsWith(path.join("helpers", "ipcHandlers.js"))) {
      assert.equal(calls, 1, "ipcHandlers.js starts it from writing-model-start only");
      assert.match(
        read(file),
        /ipcMain\.handle\("writing-model-start"[\s\S]{0,120}\.writing\.start\(/
      );
    } else {
      assert.equal(calls, 0, `${file} must not start the writing model's download`);
    }
  }
  // The renderer asks from one module: the workspace's hook (after setup) and
  // Settings' own button both live in useWritingModel.ts.
  const askers = ALL_SOURCES.filter((file) => /startWritingModelDownload\?\.\(/.test(read(file)));
  assert.deepEqual(askers.map((file) => path.basename(file)).sort(), ["useWritingModel.ts"]);
  const hooks = ALL_SOURCES.filter((file) => /\buseWritingModelDownload\(\);/.test(read(file)));
  assert.deepEqual(
    hooks.map((file) => path.basename(file)),
    ["OatsWorkspace.tsx"]
  );
  assert.match(
    read("src/hooks/useWritingModel.ts"),
    /setupDone: localStorage\.getItem\("onboardingCompleted"\) === "true"/
  );
});

test("the writing model's automatic start is announced, once, with its Cancel", () => {
  const notices = ALL_SOURCES.filter((file) => /<WritingModelNotice \/>/.test(read(file)));
  assert.deepEqual(
    notices.map((file) => path.basename(file)),
    ["OatsWorkspace.tsx"]
  );
  const autoStarts = ALL_SOURCES.filter((file) => /writingAutoStarted: true/.test(read(file)));
  assert.deepEqual(
    autoStarts.map((file) => path.basename(file)),
    ["useWritingModel.ts"]
  );
  const notice = read("src/components/WritingModelNotice.tsx");
  assert.match(notice, /shouldShowWritingNotice\(/);
  assert.match(notice, /cancelWritingModel\(\)/, "its Cancel is the remembered no");
});

test("the writing model comes through the counted download path, from Hugging Face", () => {
  const fetcher = read("src/helpers/writingModelFetch.js");
  assert.match(fetcher, /this\.modelManager\.downloadModel\(/);
  assert.doesNotMatch(fetcher, /\bfetch\(|require\(["'](node:)?https?["']\)|\bnet\.request\(/);
  // downloadModel → downloadUtils.downloadFile → Electron's net.request,
  // which the ledger counts (networkLedger.js).
  assert.match(
    read("src/helpers/modelManagerBridge.js"),
    /await sharedDownloadFile\(downloadUrl, modelPath/
  );
  const registry = JSON.parse(read("src/models/modelRegistryData.json"));
  for (const id of ["gemma-4-e4b-it-q4_k_m", "qwen3.5-4b-q4_k_m"]) {
    const provider = registry.localProviders.find((item) => item.models.some((m) => m.id === id));
    assert.equal(provider.baseUrl, "https://huggingface.co", `${id} comes from Hugging Face`);
  }
});
