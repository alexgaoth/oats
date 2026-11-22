import { forwardRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FeatureModelRow } from "../settings/FeatureModelRow";
import { OatsMark } from "../shell/OatsMark";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import { useRoomModelStore } from "../../stores/roomModelStore";
import { UPGRADE_NOTICE_KEY } from "../../helpers/speechTier.mjs";
import { WRITING_NOTICE_KEY } from "../../helpers/writingTier.mjs";

/**
 * Setup's third step, "Your models" (Alex, 2026-11-22): the rows of Settings
 * › AI models (FeatureModelRow), status only. The downloads "Where Oats
 * thinks" named start when that step is continued, by the workspace's own
 * hooks (OnboardingFlow mounts them), so each row shows its model coming and
 * then Ready; with a key, Ready and the key. Get started does not wait: the
 * downloads go on in the background, and the sidebar and Settings show them.
 */
export const ModelsStep = forwardRef<HTMLHeadingElement>(function ModelsStep(_props, headingRef) {
  const { t } = useTranslation();
  const speech = useDeviceTierStore((state) =>
    Boolean(state.tier?.turbo?.downloading || state.tier?.turbo?.checking)
  );
  const writing = useDeviceTierStore((state) => Boolean(state.tier?.writing?.downloading));
  const room = useRoomModelStore((state) => state.progress !== null);
  const downloading = speech || writing || room;

  // This step showed the downloads, so the workspace's one-time notices of
  // them would only say it again.
  useEffect(() => {
    try {
      if (speech) localStorage.setItem(UPGRADE_NOTICE_KEY, "1");
      if (writing) localStorage.setItem(WRITING_NOTICE_KEY, "1");
    } catch {
      // Without storage the notice shows once per launch, as before.
    }
  }, [speech, writing]);

  return (
    <div className="flex flex-col items-stretch">
      <div className="flex flex-col items-center text-center">
        <OatsMark className="size-12" shadow />
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-foreground outline-none"
        >
          {t("onboarding.models.title")}
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {downloading ? t("onboarding.models.downloading") : t("onboarding.models.settled")}
        </p>
      </div>
      <div
        data-setup-models
        className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-left shadow-xs"
      >
        <FeatureModelRow feature="conversations" menus={false} />
        <FeatureModelRow feature="dictation" menus={false} />
        <FeatureModelRow feature="writing" menus={false} />
      </div>
    </div>
  );
});
