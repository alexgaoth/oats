import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { ProcessingChoice, WhatIsSent } from "../settings/ProcessingChoice";
import { ProviderKeyField } from "../settings/ProviderKeyField";
import type { ProcessingMode } from "../settings/processing";
import { OatsMark } from "../shell/OatsMark";
import type { LocalDownloads } from "./processingSetup";
import { getCachedPlatform } from "../../utils/platform";

/**
 * Setup's second step, "Where Oats thinks": the same processing choice as
 * Settings › AI models (ProcessingChoice). On this Mac, it names what will be
 * downloaded and how big it is; with an API key, it takes the key in place,
 * checked before it is saved. The choice is committed when the person
 * continues (OnboardingFlow), so trying both options changes nothing.
 */
export const ProcessingStep = forwardRef<
  HTMLHeadingElement,
  {
    value: ProcessingMode;
    onChange: (mode: ProcessingMode) => void;
    downloads: LocalDownloads;
  }
>(function ProcessingStep({ value, onChange, downloads }, headingRef) {
  const { t, i18n } = useTranslation();
  const mac = getCachedPlatform() === "darwin";
  const list = (() => {
    try {
      return new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(downloads.items);
    } catch {
      return downloads.items.join(", ");
    }
  })();

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
                : mac
                  ? t("onboarding.processing.nothingToDownload")
                  : t("onboarding.processing.nothingToDownloadComputer")}
            </p>
          ),
          providers: (
            <div className="space-y-3">
              <ProviderKeyField provider="any" />
              <WhatIsSent />
            </div>
          ),
        }}
      />
    </div>
  );
});
