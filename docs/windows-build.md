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
  `windows-mic-listener`, `windows-system-audio-helper`, `nircmd`), downloaded
  from OpenWhispr's helper releases. Their C sources live in `resources/` and
  the `build-windows-*.js` scripts rebuild them with MSVC when they change.
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

## Known limits of the first build

- Unsigned: SmartScreen will warn on first run until a certificate exists.
- `windows-key-listener.exe` is pinned to the upstream v1.0.0 helper release;
  its unpinned lookup falls outside the 50 most recent OpenWhispr releases, so
  the download script fetches an exact tag when a version is pinned.
