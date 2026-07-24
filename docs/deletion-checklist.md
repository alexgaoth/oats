# Stage 2 deletion checklist — cutting the SaaS umbilical

Traced 2026-07-23 against commit `8fd2b97` (Stage 1 baseline). This is the
actionable diff for IMPLEMENTATION.md Stage 2. BYOK providers (OpenAI,
Anthropic, Gemini, Groq, Mistral, Tinfoil, Corti, LAN/local), local
transcription/reasoning, and Google Calendar are explicitly out of scope —
keep them.

## Renderer (`src/`) — delete entirely

- `src/lib/auth.ts`, `src/hooks/useAuth.ts`, `src/hooks/useUsage.ts`
- `src/services/SyncService.ts`, `WorkspacesService.ts`,
  `WorkspaceApiKeysService.ts`, `TeamsService.ts`, `InvitationsService.ts`,
  `NoteSharingService.ts`, `cloudApi.ts`, `ApiKeysService.ts` (server-key
  variant — confirmed pure `/api/v1/keys/*` SaaS management, unrelated to
  BYOK key storage which lives in `src/helpers/secretCrypto.js` via
  `@napi-rs/keyring` and is kept)
- `src/services/ai/enterpriseChatModel.ts`,
  `src/services/ai/inferenceProviders/enterprise.ts`,
  `src/services/ai/inferenceProviders/openwhispr.ts`
- `src/stores/workspaceStore.ts`
- Components: `AuthenticationStep.tsx`, `EmailVerificationStep.tsx`,
  `ForgotPasswordView.tsx`, `UsageDisplay.tsx`, `UpgradePrompt.tsx`,
  `ReferralModal.tsx`, `ReferralDashboard.tsx`, `referral-cards/` (dir),
  `WorkspaceSwitcher.tsx`, `CreateWorkspaceDialog.tsx`,
  `InviteTeammateDialog.tsx`, `AcceptInvitationModal.tsx`,
  `settings/WorkspaceBillingTab.tsx`, `settings/WorkspaceMembersTab.tsx`,
  `settings/WorkspaceSection.tsx`, `settings/WorkspaceTeamsTab.tsx`,
  `settings/WorkspaceDeveloperTab.tsx`, `notes/ShareNoteDialog.tsx`

Then repair every importer (AppRouter.jsx, ControlPanel.tsx,
ControlPanelSidebar.tsx, SettingsPage.tsx, NoteEditor.tsx,
useFolderManagement.ts, tools/{create,update}NoteTool.ts, settingsStore.ts,
helpers/database.js, helpers/audioManager.js, helpers/{dictation,chat}Routing.js,
models/ModelRegistry.ts + modelRegistryData.json, services/ai/providers.ts,
services/ai/inferenceProviders/index.ts, types/electron.ts, OnboardingFlow.tsx,
EnterpriseProviderConfig.tsx, TestConnectionButton.tsx,
InferenceConfigEditor.tsx, CustomModelInput.tsx, ApiKeysSection.tsx,
locales/*/translation.json) so no import, route, JSX usage, or orphaned
locale key remains.

**Re-point defaults (Stage 2.4):** `settingsStore.ts` defaults ~30 inference
modes (transcription, cleanup, meeting/upload transcription, note formatting,
translation, chat/dictation agent) to the literal `"openwhispr"`, with
matching `v === "openwhispr" || ...` validity checks. Since cloud becomes
BYOK-only, `"openwhispr"` is removed from the `InferenceMode` value space
entirely and every default/validity-check falls back to `"local"`.

## Main process (`main.js`, `preload.js`, `src/helpers/ipcHandlers.js`) — surgical removal

Full line-referenced map (see prior trace) — summary:

- **OAuth/auth-bridge/protocol subsystem** — `main.js:511-821` (contiguous
  core: `open-url`, invitation/upgrade/OAuth deep-link handlers, auth-bridge
  HTTP server, Origin-header spoofing) plus anchors at `50-56`, `136-234`,
  `329-343`, `450-451`, `791`, `799`, `1555-1565`.
- **Auth IPC**: `auth-clear-session`/`auth-get-token`/`auth-set-token`,
  `get-oauth-protocol(-registered)` (`ipcHandlers.js:4105-4130, 7879-7881,
  416-417`).
- **Cloud transcription/reasoning/agent/billing IPC**:
  `cloud-transcribe`, `cloud-health-check`, `cloud-reason`,
  `cloud-agent-stream-start`, `agent-web-search`, `cloud-streaming-usage`,
  `cloud-usage`, `cloud-checkout`, `cloud-billing-portal`,
  `cloud-switch-plan`, `cloud-preview-switch`, `cloud-api-request`,
  `get-stt-config`, `get-note-recording-config`,
  `transcribe-audio-file-cloud`, plus their private helpers
  (`chunkedCloudTranscribe`, `interpretTranscribeResponse`, `fetchStripeUrl`,
  `getApiUrl`/`getAuthUrl`/`getAuthHeader*`). Keep `proxyFetch`,
  `buildMultipartBody`/`postMultipart` (shared with BYOK), and
  `agent-open-note` (purely local despite the "cloud" grouping in preload).
- **`retry-transcription`** (`ipcHandlers.js:4346-4545`): excise only the
  `cloudTranscriptionMode === "openwhispr"` branch (`4402-4441`); every other
  branch (self-hosted, local, Tinfoil, generic BYOK) stays.
- **`fetchRealtimeToken`** (`ipcHandlers.js:5070-5184`): per-provider
  `mode === "byok"` branches stay; the `else` branches that call
  `postServerToken("/api/...-token")` (OpenWhispr-hosted) are removed for
  `assemblyai-realtime`, `deepgram-realtime`, and `openai-realtime`.
  `corti-realtime`/`tinfoil-realtime` are always-BYOK, untouched.
- **AssemblyAI/Deepgram cloud streaming** (`preload.js:581-629`,
  `ipcHandlers.js:7899-8377`): removed wholesale — these mint tokens from
  OpenWhispr's backend, not a user-supplied key, so unlike Corti/Tinfoil they
  are not BYOK and are not on the kept-provider list.
- **Referral IPC**: `get-referral-stats`, `send-referral-invite`,
  `get-referral-invites` (`ipcHandlers.js:7634-7742`).
- **Usage/upgrade wiring**: `limit-reached` (`main.js:1520-1525`),
  `notifyLimitReached`/`onLimitReached` (`preload.js:700-702`).
- **Cloud-sync DB bookkeeping IPC**: the `db-get-pending-*`/`db-*-from-cloud`/
  `db-mark-*-synced`/`db-hard-delete-*`/`db-update-*-cloud-id` family
  (`ipcHandlers.js:1145-1213, 1356-1358, 1530-1532, 1557-1665`) — verified
  `database.js`'s underlying methods aren't independently called outside the
  sync path before removing the IPC layer.
- **Workspace invitation deep link**: covered by the OAuth block above
  (`handleInvitationDeepLink`, `onWorkspaceInvitationToken`).

**Explicitly kept** despite matching a SaaS-adjacent keyword: Google Calendar
OAuth/sync (separate integration, no shared auth-bridge machinery — verified
by grep), `getAudioStorageUsage` (local disk stat), `syncStartupPreferences`/
`syncNotificationPreferences` (local prefs, not cloud sync), `agent-open-note`.

## Package/env

- Remove `better-auth`, `@better-auth/sso` from `package.json`.
- Remove `VITE_AUTH_URL`, `VITE_OPENWHISPR_API_URL` from `.env.example`
  (and the "Better Auth" / "OpenWhispr Cloud API" comment blocks around them).

## Gate

`verify:oats` green; `grep -ri "openwhispr.com\|better-auth\|SyncService\|useUsage" src main.js preload.js` returns nothing except intentional upstream credit (README/UPSTREAM.md/LICENSE, which live outside `src`/`main.js`/`preload.js` anyway); a live network trace of a full session shows zero traffic to OpenWhispr hosts (manual follow-up, needs a human running the app).

## Execution notes (2026-07-23)

Both gates above pass on the final tree. A few things surfaced beyond the
original plan above that are worth recording:

- **Additional legitimate deletions** found only once the trace above was
  underway, all confirmed to have zero non-SaaS callers before removal:
  `src/lib/features.ts` (`WORKSPACES_ENABLED`/`SHARING_ENABLED`, dead once
  `workspaceStore.ts` was gone), `src/hooks/useWorkspace.ts`,
  `src/utils/pendingInvitationToken.ts`, `src/helpers/transcriptionFallback.js`
  (`resolveStreamingFallbackTarget` — always resolved to `"byok"` once
  `cloudTranscriptionMode` could no longer be `"openwhispr"`),
  `src/components/ApiKeysSection.tsx` (UI for the deleted server-managed
  developer-API-key feature), `src/components/EnterpriseProviderConfig.tsx` +
  `EnterpriseSection.tsx` + `src/services/ai/enterpriseSettings.ts`
  (Azure/Bedrock/Vertex "enterprise" provider config, tied to the already-cut
  `inferenceProviders/enterprise.ts`), `src/components/notes/
  ShareVisibilityMenu.tsx` (orphaned once `ShareNoteDialog.tsx` was cut).
- **`src/stores/settingsStore.ts`**: `"openwhispr"` removed from
  `InferenceMode` everywhere; every default and validity check now resolves to
  `"local"`. `src/helpers/reasoningRouting.js`'s `deriveReasoningMode` fallback
  and the Corti onboarding payload's non-EU/no-key branch (previously
  documented as routing to "the HIPAA-compliant OpenWhispr Cloud so clinical
  text never reaches a third party") now stay local instead — there is no
  cloud fallback to preserve that compliance claim, so the safe behavior is no
  automatic cloud routing at all.
- **`src/services/tools/webSearchTool.ts`** (kept per the ledger's tool list)
  had no BYOK backend for its only implementation (`agent-web-search` against
  OpenWhispr's own API). It now reports "not available" rather than calling a
  removed IPC channel; a real BYOK web-search provider is a product decision
  for a later stage, not a Stage 2 concern.
- **`src/components/OnboardingFlow.tsx`**: the `welcome`/auth step is removed
  outright (flow now starts at `usecase`); this is a stopgap for Stage 2's
  scope, not the real onboarding redesign — that's Stage 5's job per
  IMPLEMENTATION.md.
- Left deliberately alone: `getSttConfig`/`getNoteRecordingConfig` type
  declarations in `types/electron.ts` and their call sites in
  `useAudioRecording.js`/`streamingProvidersStore.ts`/`audioManager.js` — the
  backing IPC is gone, but every call site already guards with `?.()` /
  `config?.success` and degrades to the correct BYOK-only behavior, so this is
  inert rather than broken. `database.js`'s now-unreachable `hardDelete*`/
  `mark*Synced`/`*FromCloud`/`cloud_id` methods and the `cloud_id`/
  `sync_status`/`workspace_id`/`team_id` DB schema columns are also left in
  place — schema/dead-method pruning is Stage 4's "prune dangling deps" job,
  not Stage 2's.
- The renderer half of this work was originally delegated to a subagent that
  ran out of budget mid-task (it had, correctly, deleted the SaaS files and
  started repairing importers, but left `AppRouter.jsx`, `ControlPanel.tsx`,
  `OnboardingFlow.tsx`, `audioManager.js`, and most of `types/electron.ts`
  still referencing removed modules/IPC channels). The remainder above was
  completed by hand and verified via `npm run verify:oats` (setup, tests,
  format, lint, typecheck, renderer build all green) plus the grep gate.
- **Not done**: the live network trace (needs a human running the packaged
  app with a traffic monitor) and `docs/network-allowlist.md` update — both
  explicitly deferred to Stage 7 in IMPLEMENTATION.md, though Stage 2's gate
  language also calls for a session-level check. Recommend doing a quick
  manual trace before relying on this stage as final proof.
