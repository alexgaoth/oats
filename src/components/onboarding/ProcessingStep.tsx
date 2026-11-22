import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { ProcessingChoice, WhatIsSent } from "../settings/ProcessingChoice";
import { ProviderKeyField, type ProviderKeyHandle } from "../settings/ProviderKeyField";
import type { ProcessingMode } from "../settings/processing";
import { OatsMark } from "../shell/OatsMark";
import type { LocalDownloads } from "./processingSetup";
import { getCachedPlatform } from "../../utils/platform";
import { detectKeyProvider } from "../../utils/keyCheck";
import { selectUsableFeatureKey, useSettingsStore } from "../../stores/settingsStore";

/**
 * Setup's second step, "Where Oats thinks": the same processing choice as
 * Settings › AI models (ProcessingChoice). On this Mac, it names what will be
 * downloaded and how big it is; with an API key, it takes the key in place,
 * checked before it is saved: Continue checks and saves a key pasted there
 * (`keyField`), so there is no Save. The choice is committed when the person
 * continues (OnboardingFlow), so trying both options changes nothing.
 * Anthropic has no speech service, so with only an Anthropic key (saved, or
 * pasted and not saved yet) speech stays on this Mac, and the step names what
 * it downloads for it, as On this Mac names its downloads: Continue starts them.
 */
export const ProcessingStep = forwardRef<
  HTMLHeadingElement,
  {
    value: ProcessingMode;
    onChange: (mode: ProcessingMode) => void;
    downloads: LocalDownloads;
    keyField: React.Ref<ProviderKeyHandle>;
    keyDraft: string;
    onKeyDraft: (draft: string) => void;
  }
>(function ProcessingStep(
  { value, onChange, downloads, keyField, keyDraft, onKeyDraft },
  headingRef
) {
  const { t, i18n } = useTranslation();
  const mac = getCachedPlatform() === "darwin";
  const join = (items: string[]) => {
    try {
      return new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(items);
    } catch {
      return items.join(", ");
    }
  };
  const list = join(downloads.items);
  const openai = useSettingsStore((state) => selectUsableFeatureKey(state, "openai"));
  const anthropic = useSettingsStore((state) => selectUsableFeatureKey(state, "anthropic"));
  const pasted = keyDraft.trim() ? detectKeyProvider(keyDraft.trim()) : null;
  const anthropicOnly =
    !openai && pasted !== "openai" && (pasted === "anthropic" || (!pasted && anthropic));
  const speechHere = downloads.speech.length
    ? t(
        mac
          ? "onboarding.processing.anthropicSpeech"
          : "onboarding.processing.anthropicSpeechComputer",
        { models: join(downloads.speech) }
      )
    : t(
        mac
          ? "onboarding.processing.anthropicSpeechReady"
          : "onboarding.processing.anthropicSpeechReadyComputer"
      );

  return (
    <div className="flex flex-col items-stretch">
      <div className="flex flex-col items-center text-center">
        <OatsMark className="size-12" shadow />
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-foreground outline-none"
        >
          {t("onboarding.processing.title")}
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {t("onboarding.processing.description")}
        </p>
      </div>
      <ProcessingChoice
        className="mt-8"
        layout="column"
        value={value}
        onChange={onChange}
        details={{
          local: (
            <p className="px-1 text-[13px] leading-5 text-muted-foreground">
              {downloads.items.length
                ? t("onboarding.processing.downloads", { models: list })
                : downloads.checking
                  ? t("oats.models.checking")
                  : mac
                    ? t("onboarding.processing.nothingToDownload")
                    : t("onboarding.processing.nothingToDownloadComputer")}
            </p>
          ),
          providers: (
            <div className="space-y-3">
              <ProviderKeyField
                ref={keyField}
                provider="any"
                showSave={false}
                onDraftChange={onKeyDraft}
              />
              {anthropicOnly && (
                <p
                  data-anthropic-speech
                  className="px-1 text-[13px] leading-5 text-muted-foreground"
                >
                  {speechHere}
                </p>
              )}
              <WhatIsSent />
            </div>
          ),
        }}
      />
    </div>
  );
});
