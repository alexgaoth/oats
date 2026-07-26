# Oats — Implementation Plan

**Product:** Oats · **Company:** arum · **Status:** implementation complete; release proof pending host credentials/hardware · **Doc owner:** (you)

> This is the build plan for `oats-arum` — a fresh repository that realizes the
> vision in `../oats/PRODUCT.md`. It is a working document; each stage has an
> exit gate. Update it as reality diverges from the plan.

---

## 0. Build status & handoff (updated 2026-07-25)

Progress so far; everything through Stage 6 is committed and `verify:oats`-green.
Stage 7 is partly done: the Fedora RPM pipeline is validated on a Fedora 44 host
and blocked only by one missing system library (details below).

| Stage                     | Commit                                             | State                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Bootstrap               | `3a798a0`                                          | ✅ done                                                                                                                                                                                                  |
| 1 Import + green baseline | `8fd2b97`                                          | ✅ done (full manual conversation-aide smoke test still needs a human)                                                                                                                                   |
| 2 Cut SaaS umbilical      | `dfc4808`                                          | ✅ done — accounts/sync/workspaces/referrals/usage/OpenWhispr-cloud gone; local + BYOK only. Trace in `docs/deletion-checklist.md`. Live network-trace confirmation deferred to Stage 7.                 |
| 3 Rebrand → Oats/arum     | `b61f53d`                                          | ✅ done — identity, oat design tokens (verified vs DESIGN.md §3 in both modes), husked-oat icon, full string + 10-locale sweep. Stale OpenWhispr-blue purged from components.                            |
| 4 Strip to scope          | `de4f92a`, `68ea388`, `d19f394` + current worktree | ✅ done — Corti and its secrets, IPC, streaming, registry, picker, routing, and tests are removed.                                                                                                       |
| 5 Refurbish UI            | current worktree                                   | ✅ done — three-step local-first onboarding, oat listening pulse, quiet aide card, and outcome-encoded Graph surface.                                                                                    |
| 6 Model bundling          | current worktree                                   | ✅ done — release builds download and bundle Whisper `base`; first run copies it into the local model cache before startup.                                                                              |
| 7 Trust proof & packaging | `c04f158`, `71cde3d` + release host                | 🟨 in progress — RPM pipeline validated (blocked on `libxcrypt-compat`); SaaS `better-auth` residue pruned; packaging metadata added. macOS notarization, idle-CPU, and live network trace still need the target host. |

**Stage 4 — completed in the current worktree:** MCP/CLI bridges, Windows native
`.c` helpers + their download/compile chains, URL/YouTube import (yt-dlp), Google
Calendar, and Corti are cut. Corti's secret keys, renderer/main-process API,
streaming transport, provider/model registries, selectors, onboarding route, and
routing tests were all removed together. Diarization **model download** remains
out of the build chain; its optional speaker-ID code degrades gracefully when no
models are installed.

**Residual inert state to prune (cosmetic, non-blocking):**

- Calendar settings keys still exist in `stores/settingsStore.ts` and
  `types/electron.ts` (`gcalAccounts`/`gcalConnected`/`gcalPrimaryOnly`/
  `notifyCalendarReminders` and the `gcal*` electron API type decls). They are
  localStorage-backed no-ops now (the backend + preload methods are gone) — safe
  to leave, tidy when convenient.
- Windows `electron-builder`/NSIS target and Windows build scripts are removed;
  v1 packaging targets macOS and Fedora only.
- Diarization feature code (`diarization.js`, `speakerEmbeddings.js`,
  `liveSpeakerIdentifier.js`) + its settings UI remain but are inert without
  bundled models.

**Stage 7 — what was validated (2026-07-25, on this Fedora 44 host):**

- **Fedora RPM pipeline works end to end** via `electron-builder --linux rpm`:
  electron download, app packaging into `dist/linux-unpacked/`, `afterPack`
  binary stripping/verification, and `fpm` download all succeed, and the `fpm`
  command is correctly formed (maps the app to `/opt/Oats`, installs
  `oats.desktop` + icon, declares the right runtime deps). The build stops at the
  **final `fpm` invocation only** because electron-builder's bundled Ruby needs
  **`libcrypt.so.1`**, which Fedora 44 does not ship by default (it moved to
  `libcrypt.so.2`). Fix: `sudo dnf install libxcrypt-compat`, then re-run
  `npm run build:linux:rpm` — no code change required. (Bundling the default
  Whisper model, `ggml-base.bin`, was fetched and staged for this build.)
- **`better-auth` / `@better-auth/sso` pruned** from `node_modules` — they were
  orphaned since Stage 2 removed them from `package.json` but were still being
  packaged. `package-lock.json` updated with Node 24.
- **Packaging metadata added** (`homepage`, author email, `linux.maintainer`) —
  these were missing after the rebrand and are required by rpm/deb.

**Still needs the target host / a human (cannot be truthfully done in this
sandbox):** `sudo dnf install libxcrypt-compat` + the final RPM smoke test;
**Apple notarization** (needs a Mac + Developer ID); the **live network trace**
(needs a running packaged app + a capture tool, ideally root for `tcpdump`); and
**idle/active CPU-memory measurement** (needs launching the GUI in a real
session). Follow `docs/network-allowlist.md` and record the evidence with the
release.

---

## 1. Strategy in one paragraph

`../oats` is already a working **OpenWhispr 1.7.6** Electron fork that carries the
**first wave** of Oats work (the `conversationAide` / `conversationGraph` core,
`oats-setup-check`, the `test:oats` suite, and rebranded prose docs). What it does
**not** yet have is the _subtraction_: it still ships OpenWhispr's SaaS umbilical
(accounts, cloud API, sync, workspaces, referrals, usage meters, upgrade prompts)
and OpenWhispr's identity (`appId`, `openwhispr://` scheme, icons, update feed).
This repo is where that subtraction happens. **The governing principle is
subtract, don't rewrite:** move working code over verbatim, and only touch a file
to (a) remove non-local / SaaS behavior, or (b) rebrand identity. Every feature
must survive PRODUCT.md's two wedges — _trivial setup_ and _a genuinely human
touch_ — or it goes.

### Locked decisions (2026-07-23)

| Decision           | Choice                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platforms (v1)** | macOS Apple Silicon (DMG) + Fedora 44 GNOME/Wayland (RPM). Windows native helpers cut.                                                                                             |
| **Scope**          | Core loop **+** local agent chat & local note tools. Cut cloud sync, workspaces/teams, MCP/CLI bridges, Google Calendar.                                                           |
| **BYOK**           | Keep bring-your-own-key cloud escape hatches (OpenAI, Anthropic, Gemini, Groq, Mistral, Tinfoil). Cut only OpenWhispr's _own_ cloud (`api`/`auth.openwhispr.com`) + usage/billing. |

The **core loop** (never cut): one-hotkey local listening session → on-device
real-time transcription → unanswered-question detection → small dismissible
click-to-search card → note + **Graph** view of the conversation. Plus local
dictation into any app. See PRODUCT.md §59.

### Design authority — `DESIGN.md`

`DESIGN.md` is the **binding visual specification** for this repo, not a mood board.
Every stage that touches identity or UI must conform to it, and design conformance
is a **gate**, not a polish pass:

- **Tokens, not literals.** All color, motion, radius, and type come from the
  Tailwind v4 `@theme` block in `src/index.css` per DESIGN.md §13. A raw hex or
  `ms` literal in a component is a review-blocking defect.
- **The oat palette replaces OpenWhispr's blue/violet** at the token level in
  Stage 3 — the reskin is a token swap, not a per-component edit.
- **Reskin, don't rebuild** (shadcn/Tailwind v4) — mirrors Stage 5.
- **The three signature surfaces** — the listening pulse, the aide card, and the
  Graph view (DESIGN.md §9) — are held to spec exactly; they _are_ the brand.
- **Both `prefers-color-scheme` modes and `prefers-reduced-motion`** are verified
  at every UI step; neither mode is an afterthought.
- **Dither is seasoning** (DESIGN.md §7): allowed only in the sanctioned moments,
  never behind text or on dense data.

When IMPLEMENTATION and DESIGN appear to conflict on a visual question, DESIGN.md
wins; raise the conflict rather than silently diverging.

---

## 2. Source topology — what we're importing from `../oats`

| Asset                                               | Size / shape                                                                                  | Disposition                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `main.js`                                           | ~1,711 lines — Electron main process                                                          | **Rebrand + prune** (SaaS IPC, auth, update feed)                    |
| `preload.js`                                        | ~1,009 lines — IPC bridge                                                                     | **Rebrand + prune**                                                  |
| `src/` renderer                                     | React 19 + Vite 8 + Tailwind v4 + shadcn/ui; entry `src/main.jsx` → `App.jsx`/`AppRouter.jsx` | **Selective** — see ledger                                           |
| `src/helpers/conversation*.mjs`                     | The Oats core (aide + graph)                                                                  | **Move verbatim** (crown jewels)                                     |
| `src/helpers/`                                      | 120 files — audio, meeting detection, IPC handlers, model mgmt                                | **Mostly keep**, prune SaaS members                                  |
| `scripts/`                                          | 39 build/download scripts                                                                     | **Keep mac+linux**, cut Windows/`nircmd`                             |
| `resources/`, `native/`, `nix/`, `flake.nix`        | binaries, native helpers, Nix env                                                             | **Keep** (mac+linux subset)                                          |
| `electron-builder.json`                             | packaging + branding + update feed                                                            | **Rebrand**                                                          |
| `test/`                                             | inherited + `test:oats` suites                                                                | **Keep**, extend                                                     |
| `src/dist/`                                         | 66 committed build artifacts                                                                  | **DO NOT import** — generated output                                 |
| `node_modules/`, `package-lock.json` regen          | deps                                                                                          | Reinstall clean via `npm ci`                                         |
| `CHANGELOG.md` (169KB, OpenWhispr's)                | upstream history                                                                              | **Do not import** — start fresh `CHANGELOG.md`                       |
| `PRODUCT.md`, `README.md`, `UPSTREAM.md`, `LICENSE` | docs + MIT                                                                                    | **Import** (README already Oats-branded; keep MIT + upstream credit) |
| `DESIGN.md`                                         | visual language / token spec (this repo)                                                      | **Authoritative** for Stages 3 & 5                                   |

---

## 3. The keep / rebrand / cut ledger

The master classification. Everything in `../oats` lands in exactly one column.

### KEEP — move verbatim (functional, local, on-brand)

- **Oats core:** `conversationAide.mjs`, `conversationGraph.mjs` + `.js` wrappers,
  `conversationChunker.js`, `noteSearch.js`, and their `test:oats` suites.
- **Transcription:** whisper.cpp / Parakeet integration, `whisper-server` helper,
  VAD, `download-whisper-*`, `download-sherpa-onnx`.
- **Local reasoning:** llama.cpp (`localReasoningBridge.js`, `download-llama-server`).
- **Semantic search:** Qdrant + MiniLM (`download-qdrant`, `download-minilm`,
  `@qdrant/js-client-rest`), `searchNotesTool`, `noteSearch`.
- **Audio:** `audioManager.js`, `audioStorage.js`, meeting AEC helper, ffmpeg-static,
  `meetingDetectionEngine.js`, `meetingProcessDetector.js` (prune any telemetry).
- **Notes + editor:** TipTap editor, `NotesService`, `FoldersService`,
  `ConversationsService`, `conversationEventsDatabase` (better-sqlite3), notes UI.
- **Local agent chat + note tools** _(kept per scope):_ `src/components/chat/`,
  `src/components/agent/`, `services/tools/{searchNotes,createNote,getNote,updateNote,listFolders,clipboard,webSearch}Tool.ts`, `ToolRegistry`, `ReasoningService` (local path).
- **BYOK providers:** `src/services/ai/inferenceProviders/*` (openai, anthropic,
  gemini, groq, mistral, tinfoil), `providers.ts`, `apiKeys` constants, key storage
  (`@napi-rs/keyring`).
- **Setup + verification:** `oats-setup-check.js`, `test:oats*`, `verify:*`, eslint/prettier/tsconfig.
- **i18n scaffold** (`i18n.ts`, `src/locales/`) — keep infra; strings get rebranded in Stage 3.
- **Nix/flake, `.nvmrc` (24)** — dev environment.

### REBRAND — move, then rewrite identity only

- `package.json` (`name`, `author`, description, keywords).
- `electron-builder.json` (`appId` → `com.arum.oats`, `productName` → `Oats`,
  protocol scheme `openwhispr` → `oats`, icon refs, signing identity, `publish` feed).
- `main.js` / `preload.js` / `src/types/electron.ts` — window titles, protocol
  handler, `OPENWHISPR_LOG_LEVEL` → `OATS_LOG_LEVEL`, menu labels, user-data dir.
- Icons/assets: `src/assets/icons/`, `src/assets/openwhispr.icon` → Oats/arum art.
- All user-facing strings + `src/locales/*/translation.json` mentioning "OpenWhispr".
- Docs: `README.md` (already Oats), `UPSTREAM.md`, `SECURITY.md`, `docs/network-allowlist.md`.

### CUT — delete (SaaS umbilical or out of scope)

**SaaS umbilical (Stage 2 — highest priority):**
`src/lib/auth.ts` (+9 importers), `@better-auth/*`, `better-auth`,
`src/services/SyncService.ts` (43KB, +11 importers), `WorkspacesService`,
`WorkspaceApiKeysService`, `TeamsService`, `InvitationsService`,
`NoteSharingService`, `cloudApi.ts`, `ApiKeysService` (server-key variant),
`src/hooks/useUsage.ts` (+7 importers), `src/services/ai/enterprise*.ts`.
Components: `AuthenticationStep`, `EmailVerificationStep`, `UsageDisplay`,
`UpgradePrompt`, `ReferralModal`, `ReferralDashboard`, `src/components/referral-cards/`,
`WorkspaceSwitcher`, `CreateWorkspaceDialog`, `InviteTeammateDialog`,
`settings/Workspace*Tab.tsx`, `settings/WorkspaceSection.tsx`, `ShareNoteDialog`.
Env: `VITE_AUTH_URL`, `VITE_OPENWHISPR_API_URL`. Hosts: `api`/`auth.openwhispr.com`.

**Out-of-scope subsystems:**

- MCP/CLI bridges: `helpers/cliBridge.js`, `McpIntegrationCard`, `CliIntegrationCard`, `IntegrationsView`.
- Google Calendar: `helpers/googleCalendarManager.js`, `googleCalendarOAuth.js`, `services/tools/calendarTool.ts` (removes the `openwhispr.com/auth/desktop-callback` dependency too).
- Windows native helpers + downloads: `nircmd`, `windows-fast-paste`, `windows-key-listener`, `windows-mic-listener`, `windows-system-audio-helper`, `build-windows-*`, `compile:winkeys/winpaste`.

**Decide during Stage 4 (flagged, not yet cut):** URL/YouTube audio import
(`UploadAudioView`, `download-yt-dlp`) — a real network surface; keep only if it
earns the "human, high-signal" bar. Diarization models (`download-diarization-models`)
— README says speaker ID is explicitly _not required_ for v1; likely cut to shrink
the DMG. Corti streaming (`cortiAuth.js`, `cortiStreaming.js`) — appears cloud;
verify and likely cut.

---

## 4. Stages

Each stage is independently shippable to `main` and ends at a **green gate**
(`npm run verify:oats` minimum). Order is dependency-driven: get a working
baseline, cut the umbilical (highest priority per PRODUCT.md §127), then rebrand,
strip, reskin, bundle, and prove.

### Stage 0 — Repo bootstrap

**Goal:** an empty, well-formed repo ready to receive code.

- `git init`; set `main` as default branch.
- Author identity, MIT `LICENSE` (retain OpenWhispr copyright line + add arum), fresh `CHANGELOG.md`.
- `.gitignore` (node_modules, `src/dist`, build output, `.env`), `.nvmrc` (24), `.npmrc`.
- `UPSTREAM.md` recording OpenWhispr 1.7.6 provenance + `git remote add upstream` note.
- This `IMPLEMENTATION.md` + `PRODUCT.md` + `README.md` + `DESIGN.md`.

**Gate:** repo initialized, docs present (incl. `DESIGN.md`), `git status` clean.

### Stage 1 — Import the engine + green baseline

**Goal:** a byte-for-byte working Oats-as-it-stands, building and testing green,
_before_ any subtraction — so every later deletion is bisectable.

- Copy the full `../oats` tree **excluding** `node_modules/`, `src/dist/`, `.git/`, `CHANGELOG.md`, Windows-only scripts.
- `npm ci` (Node 24), `npm run setup:check`, `npm run setup:local-whisper`.
- Run `npm run verify:oats` and `npm run test:oats`; record the baseline result.

**Gate:** `verify:oats` green; app launches via `npm run dev`; a manual
conversation-aide smoke test (README §"Manual conversation-aide test") passes.

### Stage 2 — Cut the SaaS umbilical ⭐ highest priority

**Goal:** nothing contacts `api`/`auth.openwhispr.com`; no accounts, sync,
workspaces, referrals, usage, or upgrade paths remain. PRODUCT.md §140's "Next step".

1. **Trace → checklist.** Produce `docs/deletion-checklist.md`: every backend/auth
   call site + the SaaS component/IPC graph (`lib/auth` ×9, `SyncService` ×11,
   `WorkspacesService` ×5, `useUsage` ×7, `Referral` ×5). This is the actionable diff.
2. **Delete** the CUT/SaaS list from §3, leaf-first (components → hooks → services → deps).
3. **Sever wiring:** remove SaaS IPC handlers in `main.js`/`preload.js`/`ipcHandlers.js`,
   auth routes in `AppRouter.jsx`, onboarding auth steps, `.env` cloud vars, and the
   `better-auth`/`@better-auth/sso` deps from `package.json`.
4. **Re-point defaults:** anywhere "OpenWhispr Cloud" was the default transcription
   path, default to local; cloud becomes BYOK-only.

**Gate:** `verify:oats` green after deletions; `grep -ri "openwhispr.com\|better-auth\|SyncService\|useUsage" src main.js preload.js` returns nothing (except intentional upstream credit); a live network trace of a full session shows zero traffic to OpenWhispr hosts.

### Stage 3 — Rebrand to Oats / arum

**Goal:** no OpenWhispr identity remains except the MIT upstream credit.

- `appId: com.arum.oats`, `productName: Oats`, protocol `oats://`, `OATS_LOG_LEVEL`.
- **Land the design tokens (DESIGN.md §3, §6, §8, §13):** overwrite the `@theme`
  block in `src/index.css` with the oat palette (retire the blue `--color-primary`
  / violet `--color-accent`), add the `.dark` Steel-cut overrides, `--motion-*`
  tokens, `--font-family-mono`, and bump `--radius` to `8px`.
- New app icons + arum brand assets — the **husked-oat symbol** (DESIGN.md §2);
  replace `openwhispr.icon` and the `compile:mac-icon` source. Wordmark is lowercase.
- `publish` feed → arum's GitHub repo (or disable auto-update for v1; decide in Stage 7).
- Sweep all strings, menus, window titles, `NS*UsageDescription`, and `src/locales/*`
  to the Oats voice (DESIGN.md §11: lowercase-friendly, no exclamations, privacy-as-fact).
- `package.json` name/author/description/keywords.

**Gate:** `grep -ri "openwhispr" src main.js preload.js electron-builder.json` → only
the LICENSE/UPSTREAM credit lines; app launches branded as Oats; the `@theme` block
carries the oat palette in both modes and no component references a raw color literal.

### Stage 4 — Strip to scope

**Goal:** only the core loop + local agent chat + note tools remain.

- Cut MCP/CLI bridges, Google Calendar, Windows helpers (§3 CUT).
- Rule on the flagged subsystems (URL import, diarization, Corti) and cut accordingly.
- Prune `prestart`/`prebuild`/`predev:main` download chains for removed models/helpers.
- Trim `package.json` deps left dangling by the cuts (e.g. calendar, yt-dlp if cut).

**Gate:** `verify:oats` green; `npm run dev` shows no dead nav entries; dependency tree has no orphaned SaaS/OOS packages (`depcheck`).

### Stage 5 — Refurbish UI around the loop

**Goal:** the loop is the product surface. **`DESIGN.md` is the spec for this entire
stage.** Reskin against the Stage-3 tokens — do not rebuild (Tailwind v4 + shadcn).

- **3-step onboarding:** drag→Applications (implicit) → allow microphone →
  (macOS) allow accessibility → talk. Remove the auth/email/workspace steps. Use the
  dithered oat-field hero + quiet mono copy from DESIGN.md §9 (empty/hero states).
- **Build the three signature surfaces to spec (DESIGN.md §9):**
  - **Listening pulse** — breathing dithered gold seed; never a red REC dot/banner.
  - **Aide card** — `surface-raised`, 14px, question in mono, single gold action,
    non-modal, quiet auto-expire; nothing leaves the device until the click.
  - **Graph view** — elevated as _the_ signature surface; nodes colored **and
    dithered by outcome** per DESIGN.md §4 (density encodes uncertainty).
- **Collapse settings to essentials:** transcription model, aide toggle + classifier
  model, hotkey, optional BYOK keys. Remove enterprise/team/referral/integration panels.
- Apply the oat identity via tokens only (palette, mono/sans scale, spacing, motion);
  ship the 8×8 Bayer mask + `.dither` utility and the pulse canvas component (§13).

**Gate:** onboarding is ≤3 real steps and needs no account; Graph view is reachable
in one click from a recorded note; settings fits the "10-second non-event" claim;
**design conformance passes** — both color modes and reduced-motion verified, no raw
color/motion literals in components, dither confined to sanctioned surfaces (§7),
and the three signature surfaces match DESIGN.md §9.

### Stage 6 — Model bundling & first-run

**Goal:** first conversation works offline with zero clicks (PRODUCT.md §98).

- Bake the engine at build time: whisper.cpp/Parakeet, llama.cpp, ffmpeg/VAD/AEC,
  Qdrant + MiniLM embedding model (already in the download/build chain).
- **Bundle a small default speech model** in the DMG/RPM so first run is offline-capable.
- Background silent-upgrade to a better speech model when a network appears.
- First-run: mic permission → (macOS) accessibility → ready. No key, no download prompt.

**Gate:** on a network-disconnected fresh install, a full record→transcribe→
question-card→Graph flow completes with no clicks beyond permissions.

### Stage 7 — Trust proof & packaging (the honest gate)

**Goal:** _prove_ the privacy claim and ship installers. PRODUCT.md §135.

- **Notarize** the macOS DMG (Apple Developer ID); staple.
- Build + smoke-test the **Fedora 44 RPM** (GNOME/Wayland).
- **Measure idle CPU/memory** of the always-listening detector; confirm it's cheap when idle.
- **Network-trace a full session** end to end; update `docs/network-allowlist.md` to
  the Oats reality (only explicit-click Google search + user-added keys + model downloads leave the device).
- Decide auto-update: arum feed vs. manual releases for v1.

**Gate:** signed/notarized DMG + working RPM; published network allowlist matches the
observed trace; idle-CPU number recorded in the README status section.

---

## 5. Cross-cutting verification gates

Run at the end of every stage:

```sh
npm run setup:check      # environment + whisper helper present
npm run test:oats        # aide + graph + db unit/integration tests
npm run verify:oats      # setup + oats tests + format + lint + tsc + renderer build
npm run verify:all       # + inherited electron suite (before sharing)
```

Privacy-specific gates (Stages 2 & 7): a repo grep for OpenWhispr hosts/auth, and a
live network capture (e.g. `mitmproxy` / Little Snitch / `ss -tp`) over a full session.

Design-conformance gate (Stages 3 & 5, per `DESIGN.md`): every color/motion/radius
value resolves to an `@theme` token — no raw literals in components; both Oat-milk
and Steel-cut modes and `prefers-reduced-motion` render correctly; dither appears
only in sanctioned surfaces (§7) and never behind text; the listening pulse, aide
card, and Graph view match DESIGN.md §9; text contrast meets §12.

---

## 6. Risks & open questions

- **Tangled SaaS graph.** Auth/sync/usage thread through 5–11 files each; deletions
  will cascade into `main.js`/`ipcHandlers.js`/`AppRouter.jsx`. Trace fully (Stage 2.1)
  before deleting, and lean on the green baseline (Stage 1) to bisect breakage.
- **Local reasoning ↔ enterprise coupling.** `ReasoningService.ts` (34KB) serves both
  the local path (keep) and enterprise chat (cut). Separate carefully; don't drop local.
- **BYOK vs. "nothing leaves the device."** Keeping BYOK means the network allowlist is
  non-empty by design. Messaging must be exact: local by default, cloud only on an
  explicit user-added key.
- **Diarization / URL-import / Corti** are unresolved keep/cut calls parked in Stage 4.
- **Auto-update feed** ownership (arum GitHub org, signing certs) — parked to Stage 7.
- **DMG size** — heavy inherited deps are _not_ an immediate optimization target
  (README §40), but bundling a default model + full engine may push size; revisit post-v1.

---

## 7. Sequencing summary

```
Stage 0  Bootstrap ─────────────► empty, well-formed repo
Stage 1  Import + baseline ─────► verify:oats GREEN (reference point)
Stage 2  Cut SaaS umbilical ⭐ ─► zero OpenWhispr-host traffic
Stage 3  Rebrand → Oats/arum ──► no OpenWhispr identity (except credit)
Stage 4  Strip to scope ───────► core loop + local chat only
Stage 5  Refurbish UI ─────────► ≤3-step onboarding, Graph elevated
Stage 6  Bundle + first-run ───► offline zero-click first conversation
Stage 7  Trust proof + package ► notarized DMG + RPM + published trace
```

The moat is subtraction done rigorously: trivial setup, genuinely local, provably
private. Stages 2 and 7 are where that moat is actually earned.
