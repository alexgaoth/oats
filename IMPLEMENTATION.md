# Oats — Implementation Plan

**Product:** Oats · **Status:** Stages 0–6 landed; Stages 8–10 built and unit-tested but not yet exercised against real speech; Stage 7 release proof outstanding. `TODO.md` is the live tracker · **Doc owner:** (you)

> This is the build plan for `oats-arum` — a fresh repository that realizes the
> vision in `../oats/PRODUCT.md`. It is a working document; each stage has an
> exit gate. Update it as reality diverges from the plan.

---

## 0. Build status & handoff (updated 2026-07-28)

### Product-direction update (2026-07-28)

The previous Stage 5 UI handoff is superseded by a deliberate product reset. Oats
must not resemble OpenWhispr in visual language or information architecture.
The primary control-panel experience is now exactly **Conversation**,
**Intelligence**, and **Settings** (`src/components/OatsWorkspace.tsx`).

- Conversation is microphone-only, in-person recording, and it carries the
  listening pulse, the live question cards, and the collapsed open-thread stack.
  Stopping it automatically saves the transcript and starts intelligence generation.
- Intelligence is the only primary browsing surface: titled summary, transcript,
  and the **topic graph** (Obsidian-style, force-directed), with the linear thread
  list as the fallback for short conversations.
- Settings shows only the essentials and puts everything else behind one
  non-default **Advanced** path (DESIGN.md §13).

Legacy notes, chat, dictation, online-recording, and detailed model controls are
temporarily retained behind the implementation for compatibility. Do not restore
them to primary navigation. Future work should migrate their persistence paths to
the unified conversation pipeline and delete their old product surfaces.

### Resolved conflicts (2026-07-28) — these override anything earlier in this file

Three earlier decisions are reversed. Where any doc, gate, or comment still
reflects the old behavior, the new behavior wins:

1. **Every question gets a card, not only unanswered ones.** The aide previously
   returned early on `isAnswered` (`conversationAide.mjs`) and waited
   `silenceDelayMs` (8s) before showing anything. Both are wrong now: the card
   appears on local detection with zero latency and resolves in place when the
   verdict lands.
2. **Uncertain and unanswered questions auto-open the search.** The previous
   click-only boundary — stated in README, this file's Stage 2/7 gates,
   `docs/network-allowlist.md`, and DESIGN.md §9 — is replaced by background
   auto-open, default on, with one Settings toggle. The privacy claim narrows
   accordingly and precisely: _audio and transcripts_ never leave the device;
   _question text_ does, for unanswered questions only. Overstating this is now
   the review-blocking failure, not the search itself.
3. **Repetition is preserved, not deduplicated.** `suggested`, `cooldownMs`, and
   `candidateDedupeMs` exist to suppress repeats. Repeats and rephrasings are
   signal; each gets its own card, nested under the first. Density is solved by
   stacking in the UI, never by dropping detections.

### Where things actually stand

Everything through Stage 6 is committed and `verify:oats`-green, **but the
2026-07-28 workspace reset regressed Stage 5's design conformance** — see the
Stage 5 row. Stage 7 is partly done. Stages 8–10 carry the features this document
previously did not describe at all, and they are the bulk of the remaining work.

| Stage                     | Commit                                             | State                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Bootstrap               | `3a798a0`                                          | ✅ done                                                                                                                                                                                  |
| 1 Import + green baseline | `8fd2b97`                                          | ✅ done (full manual conversation-aide smoke test still needs a human)                                                                                                                   |
| 2 Cut SaaS umbilical      | `dfc4808`                                          | ✅ done — accounts/sync/workspaces/referrals/usage/OpenWhispr-cloud gone; local + BYOK only. Trace in `docs/deletion-checklist.md`. Live network-trace confirmation deferred to Stage 7. |
| 3 Rebrand → Oats/arum     | `b61f53d`                                          | ✅ done — identity, oat design tokens (verified vs DESIGN.md §3 in both modes), husked-oat icon, full string + 10-locale sweep. Stale OpenWhispr-blue purged from components.            |
| 4 Strip to scope          | `de4f92a`, `68ea388`, `d19f394` + current worktree | ✅ done — Corti and its secrets, IPC, streaming, registry, picker, routing, and tests are removed.                                                                                       |
| 5 Refurbish UI            | current worktree                                   | ✅ regression repaired in Stage 10 — the pulse, the oat seed, and the token-only styling are back on the reset workspace.                                                                |
| 6 Model bundling          | current worktree                                   | ✅ done — release builds download and bundle Whisper `base`; first run copies it into the local model cache before startup. Confirmed present in the built RPM.                          |
| 7 Trust proof & packaging | `c04f158`, `71cde3d` + release host                | 🟨 in progress — **RPM now builds** (see below). macOS notarization, idle-CPU, the live network trace, and the RPM install smoke test still need the target host.                        |
| 8 Catch every question    | current worktree                                   | ✅ built — instant cards, per-asking cards, confirmed-negative auto-search, card rail, question extraction, local-first verdicts. 26 unit tests.                                         |
| 9 Stack & topic graph     | current worktree                                   | ✅ built — topic tracker, open-thread stack, suggestions, topic graph, lifetime graph. 22 unit tests.                                                                                    |
| 10 Sleek pass             | current worktree                                   | ✅ built — pulse, oat seed, wheat field, Settings essentials + Advanced, dictation hotkey.                                                                                               |
| 11 Reliability            | current worktree                                   | ✅ built — dictation paste on Wayland/XWayland, transcript checkpointing, empty-recording and dead-mic reporting, undo, rename, cross-conversation search.                               |
| Post-v1 iPhone            | —                                                  | ⬜ deferred by decision — see §8.                                                                                                                                                        |

**What "built" means here, precisely:** the code is written, typed, linted,
formatted, and green under `npm run verify:oats` and the full inherited suite,
with unit tests over the pure logic. Dictation paste has been confirmed working on
the Fedora host. What remains unproven is behaviour against **real speech** —
question detection quality, the topic-shift thresholds behind the stack and the
graphs, and suggestion relevance are all tuned against scripted utterances only.
Do not record those as validated in a release.

**Stage 7 — RPM built 2026-07-28.** `dist/Oats-1.7.6-linux-x86_64.rpm`, 455 MB,
after `libxcrypt-compat-4.5.2-3.fc44` cleared the `fpm` blocker. Read-only
inspection: `oats 1.7.6-1 x86_64`, MIT, `/opt/Oats/oats`, `oats.desktop`, correct
runtime deps, and `resources/bin/whisper-models/ggml-base.bin` present — Stage 6's
offline first run genuinely ships. That build predates Stages 8–10; rebuild before
using it as release evidence. Installing it and launching the GUI is left to a
human.

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
  `oats.desktop` + icon, declares the right runtime deps). The build stopped at the
  **final `fpm` invocation only** because electron-builder's bundled Ruby needs
  **`libcrypt.so.1`**, which Fedora 44 does not ship by default (it moved to
  `libcrypt.so.2`). (Bundling the default Whisper model, `ggml-base.bin`, was
  fetched and staged for this build.)
  **Update 2026-07-28:** `libxcrypt-compat-4.5.2-3.fc44` is now installed on this
  host, so the blocker is cleared — but `npm run build:linux:rpm` has not been
  re-run and `dist/` contains no `.rpm`. Re-running it is the next concrete step.
- **`better-auth` / `@better-auth/sso` pruned** from `node_modules` — they were
  orphaned since Stage 2 removed them from `package.json` but were still being
  packaged. `package-lock.json` updated with Node 24.
- **Packaging metadata added** (`homepage`, author email, `linux.maintainer`) —
  these were missing after the rebrand and are required by rpm/deb.

**Still needs the target host / a human (cannot be truthfully done in this
sandbox):** the RPM install + smoke test; **Apple notarization**
(needs a Mac + Developer ID); the **live network trace** (needs a running packaged
app + a capture tool, ideally root for `tcpdump`) — and it must now cover the
auto-search case described in `docs/network-allowlist.md`; and **idle/active
CPU-memory measurement** (needs launching the GUI in a real session). Record the
evidence with the release.

**Can this document be deleted?** Not yet. Stage 7 has four unfinished items above,
Stage 5 has regressed, and Stages 8–10 are unbuilt. Delete it when every stage row
is ✅ and the release evidence is filed — at that point the README status section
carries everything a reader needs.

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
| **Platforms (v1)** | macOS Apple Silicon (DMG) + Fedora 44 GNOME/Wayland (RPM). Windows native helpers cut. **iPhone is a post-v1 goal**, scoped in §8 — not a port.                                    |
| **Scope**          | Core loop **+** local agent chat & local note tools. Cut cloud sync, workspaces/teams, MCP/CLI bridges, Google Calendar.                                                           |
| **BYOK**           | Keep bring-your-own-key cloud escape hatches (OpenAI, Anthropic, Gemini, Groq, Mistral, Tinfoil). Cut only OpenWhispr's _own_ cloud (`api`/`auth.openwhispr.com`) + usage/billing. |

The **core loop** (never cut): one-action local listening session → on-device
real-time transcription → **every** question caught the instant it is asked →
an instant card that resolves in place, auto-opening a background search when
nobody answered → a live open-thread stack → note + **topic graph** of how the
conversation moved.

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
- **The four signature surfaces** — the listening pulse, the question card, the
  open-thread stack, and the topic graph (DESIGN.md §9) — are held to spec
  exactly; they _are_ the brand.
- **The sleekness budget and the Settings rule** (DESIGN.md §1, §13) are gates,
  not taste: one heading, one primary action, one content region per surface; the
  visible Settings page carries only the essentials, everything else behind one
  non-default Advanced entry.
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
- **Build the signature surfaces to spec (DESIGN.md §9):** the listening pulse and
  the question card. (The open-thread stack and topic graph are Stage 9; the
  card's instant/auto-open behavior is Stage 8. This stage's job is the visual
  foundation they all sit on.)
- **Collapse settings to essentials** and remove enterprise/team/referral/integration
  panels. The essentials list and the Advanced rule are finalized in Stage 10.
- Apply the oat identity via tokens only (palette, mono/sans scale, spacing, motion);
  ship the 8×8 Bayer mask + `.dither` utility and the pulse canvas component (§13).

**Gate:** onboarding is ≤3 real steps and needs no account; conversation structure
is reachable in one click from a recorded note; **design conformance passes** —
both color modes and reduced-motion verified, no raw color/motion literals in
components, dither confined to sanctioned surfaces (§7).

> **Status: regressed.** The 2026-07-28 workspace reset kept the tokens but
> dropped the surfaces (see §0). Re-satisfying this gate is Stage 10's first task.

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
- **Network-trace a full session** end to end and confirm it matches
  `docs/network-allowlist.md`: the only in-conversation connection is one search
  per unanswered question, carrying the question text and nothing else. Run the
  auto-search-off case too and confirm zero connections.
- Decide auto-update: arum feed vs. manual releases for v1.

**Gate:** signed/notarized DMG + working RPM; published network allowlist matches the
observed trace, including the auto-search case; idle-CPU number recorded in the
README status section.

**Outstanding as of 2026-07-28:** RPM build + smoke test (unblocked, not run);
notarization; the trace; the CPU measurement.

### Stage 8 — Catch every question

**Goal:** the differentiator. Zero-latency coverage of every question asked, and
help that is already waiting when nobody could answer. Spec: DESIGN.md §9.2.

1. **Split detection from judgement in `conversationAide.mjs`.** `isQuestionCandidate`
   already runs locally with no model — promote it to an immediate `question_detected`
   emission that shows a card in the `Asked` state. The classifier keeps running on
   its own schedule and only ever _updates_ an existing card.
2. **Remove the answered early-return.** `if (!assessment.isFactualQuestion) return;`
   stays; the `assessment.isAnswered` suppression goes. Answered questions persist
   as records.
3. **Remove the suppression trio** — `this.suggested`, `cooldownMs`,
   `candidateDedupeMs`. Replace with a **grouping key** so repeats and rephrasings
   nest visually instead of vanishing. Grouping is a rendering concern; every
   detection is still persisted.
4. **Retraction has to work on live cards.** `onRetracted` currently unstages a
   candidate; it must now also withdraw a card already on screen, since cards
   appear before the transcript settles.
5. **Auto-open**, background, non-focus-stealing, via the existing host-validated
   `buildSearchUrl`/`validateSearchUrl` path. One Settings toggle, default on.
   Never fires for `Answered`.
6. **Event schema:** add a card-state field so a card's lifecycle (`asked` →
   outcome → `searched`) is reconstructable from persisted events alone.

**Gate:** the README manual question-card test passes end to end, including the
answered case producing no browser; card appears within one transcript-finalization
beat of the question; three phrasings of the same question produce three nested
cards; auto-search off produces zero connections in a capture.

### Stage 9 — The stack and the topic graph

**Goal:** the two Intelligence/recording widgets. **This stage is blocked on a data
model that does not exist yet** — persisted events are only `question`, `response`,
and `search_suggestion`. There is no topic entity, no topic-shift detection, and no
open/closed thread state. Build the data first; the UI is the easy half.

1. **Topic & thread model.** Add topic and thread events, a topic-shift detector
   over finalized utterances (local, cheap — it runs during recording), and
   open/resolved/dropped state transitions. Persist transitions, not just topics:
   the graph's edges _are_ the transitions, and the return-to-a-thread back-edge is
   the most valuable mark on the canvas.
2. **Open-thread stack** (DESIGN.md §9.3) on the Conversation surface: collapsed
   rail by default, expands in place, auto-collapses on speech, no task semantics.
3. **Topic graph** (DESIGN.md §9.4) in Intelligence: force-directed canvas, nodes
   sized by time spent, dither-encoded state, capped simulation that comes to rest,
   persisted per-conversation layout, node → questions side panel with re-search.
4. **Keep the linear thread list** as the under-four-topics fallback and the
   accessible equivalent view.

**Gate:** a recorded conversation that wanders across four or more topics and
returns to one produces a graph showing the return edge; the stack lists the
threads that were dropped and nothing else; the graph simulation reaches rest and
the process goes idle (verify with a CPU sample while the view is open);
`prefers-reduced-motion` renders the solved layout without animating.

### Stage 10 — The sleek pass

**Goal:** close the gap between DESIGN.md and what actually renders.

1. **Restore Stage 5 conformance** in `OatsWorkspace.tsx`: husked-oat seed instead
   of `Sparkles`, the breathing pulse while recording (wire `oats-breathe`, which
   currently has no consumer), warm empty states, motion tokens on view swaps.
2. **Settings essentials** (DESIGN.md §13): processing choice, microphone, language,
   hotkey, auto-search toggle, data controls. That is the whole visible page.
3. **One `Advanced` entry** at the bottom holding per-feature models, providers,
   endpoints, classifier tuning, diagnostics, and legacy configuration — never
   expanded by default, never linked from onboarding or an error.
4. **Retire `SettingsPage.tsx`** (2,969 lines) into that Advanced path rather than
   leaving two settings implementations alive.
5. **Apply the sleekness budget** (DESIGN.md §1) to all three surfaces.
6. **The wheat field** (DESIGN.md §9.8), in `src/components/conversation/wheatField/`.
   Rebuilt as pseudo-2D on the GPU after a measurement gate, which is the reason
   §9.8's original "2D canvas, no WebGL" rule was amended rather than ignored:

   - **The gate.** `main.js` appends `--disable-gpu-compositing` on all of Linux
     and relaunches under XWayland, so WebGL was not safe to assume. Probed
     inside a window configured like `CONTROL_PANEL_CONFIG`: WebGL reports
     `enabled_readback` on real hardware (`ANGLE (Intel ARL)`), **not**
     SwiftShader. 20k instances at 2400×1470 held 18.5ms against a 16.7ms
     bare-rAF baseline, with ~0ms blocking cost on the main thread. Software
     compositing readback therefore costs roughly 1.8ms/frame at 2x DPR.
   - **Why GPU at all.** Not perspective — the field is a background whose camera
     can never move. It is that instancing affords real density, and that the
     fragment shader is the only place §7's animated ordered dither is
     affordable. This is the first animated grain anywhere in the product.
   - **Verification.** `test/helpers/wheatFieldModel.test.js` covers the pure
     model (determinism, band coverage, the prefix-is-a-uniform-subsample
     property that adaptive density depends on, growth monotonicity, gust
     bounds, the §9.8 alpha ceiling). Rendering itself was checked by
     screenshotting the real component in Electron in both colour modes and
     through the growth intro — the seam and snap defects it caught would not
     have shown up in any unit test.
   - **Not yet verified:** Apple Silicon, and a human watching the gust cadence
     for a full conversation.

**Gate:** design conformance passes per §5 below; the visible Settings page fits on
one screen without scrolling at 1280×800; no raw color/motion literals; both modes
and reduced-motion verified on all four signature surfaces.

---

## 5. Cross-cutting verification gates

Run at the end of every stage:

```sh
npm run setup:check      # environment + whisper helper present
npm run test:oats        # aide + graph + db unit/integration tests
npm run verify:oats      # setup + oats tests + format + lint + tsc + renderer build
npm run verify:all       # + inherited electron suite (before sharing)
```

Privacy-specific gates (Stages 2, 7 & 8): a repo grep for OpenWhispr hosts/auth,
and a live network capture (e.g. `mitmproxy` / Little Snitch / `ss -tp`) over a
full session. From Stage 8 the capture must show **exactly one** search per
unanswered question and nothing per answered question, and zero connections with
auto-search off.

Claim-accuracy gate (Stages 8 & 10): no user-facing string, doc, or marketing line
may say "nothing leaves your device" while auto-search is on. Grep for absolute
privacy phrasing before every release; the correct claim is that _audio and
transcripts_ stay local and _question text_ is searched.

Design-conformance gate (Stages 3, 5, 9 & 10, per `DESIGN.md`): every color, motion,
and radius value resolves to an `@theme` token — no raw literals in components; both
Oat-milk and Steel-cut modes and `prefers-reduced-motion` render correctly; dither
appears only in sanctioned surfaces (§7) and never behind text; the four signature
surfaces match DESIGN.md §9; animation touches only `transform`/`opacity` per §8;
text contrast meets §12.

---

## 6. Risks & open questions

- **Tangled SaaS graph.** Auth/sync/usage thread through 5–11 files each; deletions
  will cascade into `main.js`/`ipcHandlers.js`/`AppRouter.jsx`. Trace fully (Stage 2.1)
  before deleting, and lean on the green baseline (Stage 1) to bisect breakage.
- **Local reasoning ↔ enterprise coupling.** `ReasoningService.ts` (34KB) serves both
  the local path (keep) and enterprise chat (cut). Separate carefully; don't drop local.
- **BYOK and auto-search vs. absolute privacy claims.** The allowlist is non-empty
  by design, and since the 2026-07-28 decision it is non-empty _by default_.
  Messaging must be exact and repeated everywhere: audio and transcripts are local,
  question text is searched, cloud models only on an explicit user-added key.
- **Auto-search is a real-world exposure, not just a doc problem.** A question can
  contain a name, a company, or an unannounced number, and it will land in someone's
  browser history and in Google's logs. Mitigations already specified: question text
  only, unanswered only, one visible toggle, and the `searched · google` marking on
  the card. Watch for whether that is enough once it is used in real meetings — the
  fallback is making it opt-in during onboarding rather than silently default-on.
- **Instant cards vs. transcript instability.** Cards now appear before the
  transcript settles, so a retracted segment can leave an orphaned card on screen
  (Stage 8.4). This is the most likely source of visible flicker in the product.
- **Topic detection quality gates two whole surfaces.** Both the stack and the graph
  are only as good as the topic-shift detector; a bad one makes the graph look like
  noise and the stack nag about threads that were never real. Prototype the detector
  against recorded conversations before building either UI.
- **Diarization / URL-import / Corti** are unresolved keep/cut calls parked in Stage 4.
- **Auto-update feed** ownership (arum GitHub org, signing certs) — parked to Stage 7.
- **DMG size** — heavy inherited deps are _not_ an immediate optimization target,
  but bundling a default model + full engine may push size; revisit post-v1.

---

## 7. Sequencing summary

```
Stage 0  Bootstrap ─────────────► empty, well-formed repo
Stage 1  Import + baseline ─────► verify:oats GREEN (reference point)
Stage 2  Cut SaaS umbilical ⭐ ─► zero OpenWhispr-host traffic
Stage 3  Rebrand → Oats/arum ──► no OpenWhispr identity (except credit)
Stage 4  Strip to scope ───────► core loop + local chat only
Stage 5  Refurbish UI ─────────► ≤3-step onboarding (regressed by the reset)
Stage 6  Bundle + first-run ───► offline zero-click first conversation
Stage 7  Trust proof + package ► notarized DMG + RPM + published trace
Stage 8  Catch every question ⭐► instant cards, no suppression, auto-search
Stage 9  Stack + topic graph ──► topic data model, then the two widgets
Stage 10 Sleek pass ───────────► DESIGN conformance + Settings essentials/Advanced
```

Stages 0–7 earn the right to exist: trivial setup, genuinely local, provably
private. Stages 8–10 are the reason anyone would choose Oats over a recorder —
catching what was asked, remembering what was left open, and showing where the
conversation actually went.

---

## 8. Post-v1: iPhone

iPhone is a goal, not a port. The desktop application is Electron with local
whisper.cpp, a Qdrant sidecar, and better-sqlite3 — none of which run on iOS — so
"Oats on iPhone" means a **second implementation**, which is exactly the cost that
ruled out the Muesli path for Fedora.

Two shapes, to be decided with real usage rather than now:

- **Companion (favored).** iPhone captures audio and shows finished intelligence;
  a paired Mac does transcription and reasoning. Keeps one intelligence
  implementation, keeps processing local to hardware the user owns, and makes the
  phone a microphone and a reading surface — which is what an in-person
  conversation actually needs. Cost: a pairing/transport layer that does not exist,
  and a new privacy boundary to specify and prove.
- **Standalone.** On-device speech and reasoning via Core ML / Apple's on-device
  models. No pairing, works alone, but it is a full second stack and a second set
  of model-bundling and release problems.

Not started, deliberately. Revisit once macOS and Fedora are shipped and Stages
8–10 have been used in real conversations.
