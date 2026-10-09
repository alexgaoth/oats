const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// What docs/network-allowlist.md promises, pinned where a build or a launch could
// quietly break it: no analytics endpoint, no download nobody asked for, and
// nothing of the builder's own machine inside the app.

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
  // app with no speech engine and fail nothing.
  assert.ok(pkg.scripts["prebuild:mac"], "prebuild:mac exists");
  assert.match(pkg.scripts["build:mac"], /electron-builder --mac/);
  for (const arch of ["arm64", "x64"]) {
    assert.equal(
      pkg.scripts[`build:mac:${arch}`],
      `npm run build:mac -- --${arch}`,
      `build:mac:${arch} must go through build:mac, so its prebuild runs`
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
