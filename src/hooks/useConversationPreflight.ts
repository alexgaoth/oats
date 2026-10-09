import { useCallback, useEffect, useState } from "react";
import { selectResolvedNoteFormatting, useSettingsStore } from "../stores/settingsStore";
import { localSummaryModelDownloaded } from "./useSummaryReadiness";
import { summaryReadiness } from "../utils/summaryReadiness";
import {
  blocksRecording,
  resolvePreflight,
  type PreflightFacts,
  type PreflightProblem,
} from "../utils/preflight";

export type { PreflightProblem };

export interface Preflight {
  /** The problem worth saying, or null when the room can be recorded. */
  problem: PreflightProblem | null;
  /** Whether starting is pointless rather than merely risky. */
  blocking: boolean;
  /** Re-run the checks. Called on mount, on settings changes, and on the press. */
  check: () => Promise<PreflightProblem | null>;
}

async function microphoneFacts(): Promise<Pick<PreflightFacts, "audioInputs" | "micPermission">> {
  try {
    const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
    const inputs = devices.filter((device) => device.kind === "audioinput");
    // Before permission is granted the labels are blank, which is what
    // distinguishes "no microphone" from "not allowed to use one" — but only the
    // permission API can tell a pending prompt from a refusal.
    const status = await navigator.permissions
      ?.query?.({ name: "microphone" as PermissionName })
      .catch(() => null);
    return {
      audioInputs: inputs.length,
      micPermission: (status?.state as PreflightFacts["micPermission"]) ?? "unknown",
    };
  } catch {
    // Fail open. An enumeration that throws says nothing about the microphone,
    // and refusing to record on that basis would be the worse mistake.
    return { audioInputs: 1, micPermission: "unknown" };
  }
}

async function transcriptionFacts(
  useLocalWhisper: boolean,
  localProvider: string
): Promise<Pick<PreflightFacts, "speechEngineReady" | "anyModelDownloaded" | "hasApiKey">> {
  const unknown = { speechEngineReady: null, anyModelDownloaded: null, hasApiKey: null };
  try {
    if (!useLocalWhisper) {
      const key = await window.electronAPI?.getOpenAIKey?.();
      return { ...unknown, hasApiKey: Boolean(key && key.trim()) };
    }
    if (localProvider !== "whisper") return unknown;
    const installed = await window.electronAPI?.checkWhisperInstallation?.();
    const listed = await window.electronAPI?.listWhisperModels?.();
    return {
      ...unknown,
      speechEngineReady: installed ? installed.installed && installed.working : null,
      anyModelDownloaded: listed?.success ? listed.models.some((model) => model.downloaded) : null,
    };
  } catch {
    return unknown;
  }
}

function readinessFact(readiness: ReturnType<typeof summaryReadiness>): boolean | null {
  return readiness === null ? null : readiness === "ready";
}

/**
 * Everything Oats needs before the first word, checked before the first word.
 *
 * The standard in `CLAUDE.md` is that it "fails loudly at the start rather than
 * quietly at the end". Until now the loudest early signal was the dead-microphone
 * warning, which fires after **thirty seconds** of a flat input level — by then
 * the opening of the conversation is already gone — and a missing model or key
 * was not discovered until the recording stopped and the pipeline ran.
 */
export function useConversationPreflight(): Preflight {
  const [problem, setProblem] = useState<PreflightProblem | null>(null);
  // Subscribed rather than read once, so changing the processing choice in
  // Settings clears the warning without a restart — and field by field rather
  // than through `selectResolvedMeetingTranscription`, which builds a fresh
  // object on every call and would re-render this on every unrelated change.
  //
  // These are the *meeting* scope, which is the one recording a conversation
  // actually reads (CLAUDE.md, "the trap that broke recording"). Checking the
  // dictation scope here would produce a preflight that passes while the primary
  // action fails, which is the original bug wearing a hat.
  const useLocalWhisper = useSettingsStore((state) => state.meetingUseLocalWhisper);
  const localProvider = useSettingsStore((state) => state.meetingLocalTranscriptionProvider);
  // Both gates the aide checks for an in-room conversation
  // (meetingRecordingStore.startConversationAide) — subscribed so flipping
  // either in Settings clears or raises the line without a restart.
  const aideEnabled = useSettingsStore((state) => state.conversationAideEnabled);
  const aideInRoom = useSettingsStore((state) => state.conversationAideInRoomEnabled);
  // What writes the title and summary after Finish (summaryReadiness.ts).
  const summaryMode = useSettingsStore((state) => selectResolvedNoteFormatting(state).mode);
  const summaryModel = useSettingsStore((state) => selectResolvedNoteFormatting(state).model);
  const summaryUrl = useSettingsStore((state) => selectResolvedNoteFormatting(state).remoteUrl);

  const check = useCallback(async (): Promise<PreflightProblem | null> => {
    const found = resolvePreflight({
      ...(await microphoneFacts()),
      useLocalWhisper,
      localProvider,
      ...(await transcriptionFacts(useLocalWhisper, localProvider)),
      questionCardsOn: aideEnabled && aideInRoom,
      summaryReady: readinessFact(
        summaryReadiness({
          mode: summaryMode,
          model: summaryModel,
          remoteUrl: summaryUrl,
          localModelDownloaded: await localSummaryModelDownloaded(summaryMode, summaryModel),
        })
      ),
    });
    setProblem(found);
    return found;
  }, [
    useLocalWhisper,
    localProvider,
    aideEnabled,
    aideInRoom,
    summaryMode,
    summaryModel,
    summaryUrl,
  ]);

  useEffect(() => {
    void check();
  }, [check]);

  // A microphone plugged in while this window sat open should clear the warning
  // by itself, and one unplugged mid-session should raise it — neither is worth
  // a poll when the browser reports both.
  useEffect(() => {
    const target = navigator.mediaDevices;
    if (!target?.addEventListener) return undefined;
    const handler = () => void check();
    target.addEventListener("devicechange", handler);
    return () => target.removeEventListener("devicechange", handler);
  }, [check]);

  return { problem, blocking: blocksRecording(problem), check };
}
