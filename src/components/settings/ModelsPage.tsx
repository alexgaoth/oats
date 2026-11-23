import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { SettingsSection } from "./SettingsKit";
import { ProcessingChoice, WhatIsSent } from "./ProcessingChoice";
import { FeatureModelRow } from "./FeatureModelRow";
import { ApiKeysList } from "./ApiKeysList";
import { SpeechModelChoice } from "./SpeechModelChoice";
import { WritingModelChoice } from "./WritingModelChoice";
import { GpuDeviceSelector } from "./GpuDeviceSelector";
import { QuestionModelSettings } from "./OatsSettingsSections";
import { setProcessing } from "./processing";
import {
  localSetupFor,
  roomSpeechPlan,
  selectFeatureRoute,
  selectProcessingChoice,
  selectResolvedNoteFormatting,
  useSettingsStore,
} from "../../stores/settingsStore";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useRoomModelStore } from "../../stores/roomModelStore";
import { localUpgradeHint } from "../../helpers/localSetup.mjs";

/**
 * Settings › AI models. Processing puts every feature on this Mac or on an
 * API key, and shows Mixed while they run in different places. Each feature's
 * row (FeatureModelRow) says which model it uses, where (a quiet menu that
 * moves just that feature), and whether it is ready, with its key and the
 * menu that changes it. The API keys list (ApiKeysList) adds, renames and
 * removes keys; it and the key menus say what each key can do, so the line
 * that said it under Processing is gone. Model selection stays under Advanced.
 */
export function ModelsPage() {
  const { t } = useTranslation();
  const mode = useSettingsStore((state) => selectProcessingChoice(state));
  const { upgrade, roomUpgrade } = useUpgradeHint();
  const titleId = useId();
  return (
    <div className="space-y-6">
      <section aria-labelledby={titleId}>
        <div className="mb-3 px-1">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            {t("oats.settings.processing")}
          </h3>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            {t("oats.featureRoutes.choiceDescription")}
          </p>
        </div>
        <ProcessingChoice
          value={mode}
          onChange={setProcessing}
          showDescriptions={false}
          aria-labelledby={titleId}
        />
      </section>

      <div>
        <SettingsSection title={t("oats.settings.models.title")} className="mb-3">
          <FeatureModelRow feature="conversations" upgrade={upgrade === "speech" && roomUpgrade} />
          <FeatureModelRow feature="dictation" upgrade={upgrade === "speech" && !roomUpgrade} />
          <FeatureModelRow feature="writing" upgrade={upgrade === "writing"} />
        </SettingsSection>
        <WhatIsSent featureRoutes />
      </div>

      <ApiKeysList />

      <AdvancedModels />
    </div>
  );
}

function useUpgradeHint() {
  const tier = useDeviceTierStore((state) => state.tier);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const whisper = useSettingsStore((state) =>
    selectFeatureRoute(state, "dictation").effective === "local" &&
    state.localTranscriptionProvider === "whisper"
      ? state.whisperModel
      : null
  );
  const { available, installed, progress } = useRoomModelStore();
  const roomEligible = useSettingsStore((state) =>
    Boolean(roomSpeechPlan({ ...state, roomSpeechPreference: "recommended" }, tier))
  );
  const room = available && roomEligible;
  const followingRoom = useSettingsStore((state) => Boolean(roomSpeechPlan(state, tier)));
  const writer = useSettingsStore((state) =>
    selectFeatureRoute(state, "writing").effective === "local"
      ? selectResolvedNoteFormatting(state).model
      : null
  );
  const roomWhisper = useSettingsStore((state) => state.whisperModel);
  const recording = useMeetingRecordingStore((state) => state.isRecording || state.isTranscribing);
  if (tier?.device?.platform !== "darwin") return { upgrade: null, roomUpgrade: false };
  const roomUpgrade = room && !progress && !(installed && followingRoom);
  const upgrade = localUpgradeHint({
    plan: localSetupFor(tier, language, roomUpgrade ? "local" : null),
    language,
    recording,
    activeWhisper: roomUpgrade
      ? roomWhisper
      : tier.turbo.downloading || tier.turbo.checking
        ? null
        : whisper,
    activeWriter: writer && tier.writing?.installed.includes(writer) ? writer : null,
  });
  return { upgrade, roomUpgrade };
}

/**
 * Choosing models yourself: closed by default, at the bottom. The same
 * chooser for speech and writing (ModelChoice), the question cards' optional
 * classifier, and on a computer with two GPUs which one each model uses.
 */
function AdvancedModels() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-left shadow-xs outline-none",
          "transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-90"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {t("oats.models.advanced")}
          </span>
          <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
            {t("oats.models.advancedDescription")}
          </span>
        </span>
      </button>
      {open && (
        <div id={panelId} className="mt-6 space-y-8">
          <SpeechModelChoice />
          <WritingModelChoice />
          <QuestionModelSettings />
          <GpuDeviceSelector purpose="transcription" />
          <GpuDeviceSelector purpose="intelligence" />
        </div>
      )}
    </section>
  );
}
