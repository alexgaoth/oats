# Building Oats for Windows

`npm run build:win` packs an unsigned Windows build (`electron-builder --win`):
an NSIS installer (`Oats-Setup-<version>.exe`) and a portable exe. There is no
Oats code-signing certificate yet; `electron-builder.unsigned-win.json` keeps
the upstream Azure signing config nulled out if one is ever added back.

## What a build needs

`prebuild:win` stages everything into `resources/bin/`:

- whisper.cpp / llama.cpp / sherpa-onnx / qdrant / meeting-aec-helper win32-x64
  binaries (downloaded from their upstream releases, like the mac/linux builds)
- the Windows helper binaries (`windows-key-listener`, `windows-fast-paste`,
  `windows-mic-listener`, `windows-system-audio-helper`, `windows-text-monitor`,
  `nircmd`), downloaded from OpenWhispr's helper releases. Their C sources live
  in `resources/` and the `build-windows-*.js` scripts rebuild them with MSVC
  when they change.
- the bundled speech/embedding models (`ggml-base.bin`, `ggml-base.en.bin`,
  MiniLM, VAD, diarization), the same set every desktop target ships.

## Cross-building from Linux

Works, with two caveats:

- `npm ci --ignore-scripts --os=win32 --cpu=x64` installs the win32
  node_modules (napi optional deps, onnxruntime-node's bundled win32 DLLs).
  better-sqlite3 and ffmpeg-static fetch their win32 binaries per
  `prebuild-install --runtime=electron --target=<electron version>` and the
  ffmpeg-static release tag in its package.json. Pack with
  `electron-builder --win -c.npmRebuild=false`.
- NSIS needs Wine (a WoW64 build) on PATH: electron-builder runs the installer
  stub once to extract the uninstaller. A portable Kron4ek amd64-wow64 build
  works without root.

Runtime smoke-testing still needs a real Windows machine or VM: push-to-talk,
loopback audio capture, and the mic listener only degrade gracefully, and this
build has not been run on Windows yet.

## Download integrity and licensing

Every prebuilt helper is pinned to an exact upstream release tag and verified
against a SHA256 constant in its download script before use; a mismatch aborts
the build rather than shipping an unexpected binary:

- `windows-key-listener` v1.0.0, `windows-fast-paste` v2.0.0,
  `windows-mic-listener` v1.1.0, `windows-system-audio-helper` v1.2.0,
  `windows-text-monitor` v1.0.0 (all OpenWhispr helper releases, MIT)
- `nircmd-x64.zip` (NirSoft) pinned by archive SHA256, since NirSoft publishes
  no versioned URL. nircmd is freeware whose license permits redistribution at
  no charge only when the entire distribution package ships unmodified, so
  `nircmd.exe`, `nircmdc.exe` and `NirCmd.chm` are all extracted and shipped
  together. Do not charge for builds that bundle it, and keep all three files.

Pinned tags are fetched by exact tag: helper releases older than the 50 most
recent OpenWhispr releases are invisible to prefix-scan lookups. Archive
extraction refuses absolute paths and `..` segments (zip-slip defense).

## Known limits of the first build

- Unsigned: SmartScreen will warn on first run until a certificate exists.
