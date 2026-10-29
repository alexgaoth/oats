import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Download, RotateCcw, X } from "lucide-react";
import { Button } from "../ui/button";
import { SettingRow } from "./SettingsKit";
import {
  cancelTurbo,
  formatMegabytes,
  requestTurbo,
  useSpeechTier,
} from "../../hooks/useSpeechTier";
import { useSettingsStore } from "../../stores/settingsStore";

/**
 * Settings › Models, under the speech model: what turbo is doing on this Mac
 * (speechTier.mjs `turboStatus`), and the one action that state has. Nothing
 * when there is nothing to say: an Intel Mac, a Mac that does not qualify, or
 * a model the person chose.
 */
export function SpeechTierRow() {
  const { t, i18n } = useTranslation();
  const labelId = useId();
  const { status, percent, sizeBytes } = useSpeechTier();
  const language = useSettingsStore((state) => state.preferredLanguage);
  if (!status) return null;
  const size = formatMegabytes(sizeBytes, i18n.language);

  const copy = {
    downloading: [
      t("oats.speechTier.downloading"),
      t("oats.speechTier.progress", { percent, size }),
    ],
    checking: [t("oats.speechTier.checking"), t("oats.speechTier.checkingDetail")],
    ready: [t("oats.speechTier.ready"), t("oats.speechTier.readyDetail")],
    failed: [t("oats.speechTier.failed"), t("oats.speechTier.failedDetail")],
    declined: [t("oats.speechTier.declined"), t("oats.speechTier.declinedDetail", { size })],
    slow: [t("oats.speechTier.slow"), t("oats.speechTier.slowDetail")],
    detection: [t("oats.speechTier.detection"), t("oats.speechTier.detectionDetail")],
  }[status];

  return (
    <SettingRow
      label={<span id={labelId}>{copy[0]}</span>}
      description={
        <>
          {copy[1]}
          {status === "downloading" && (
            <span
              role="progressbar"
              aria-labelledby={labelId}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </span>
          )}
        </>
      }
    >
      {status === "downloading" && (
        <Button variant="outline" size="sm" onClick={cancelTurbo}>
          <X aria-hidden="true" />
          {t("common.cancel")}
        </Button>
      )}
      {status === "failed" && (
        <Button variant="outline" size="sm" onClick={() => requestTurbo(language)}>
          <RotateCcw aria-hidden="true" />
          {t("oats.speechTier.retry")}
        </Button>
      )}
      {status === "declined" && (
        <Button variant="outline" size="sm" onClick={() => requestTurbo(language)}>
          <Download aria-hidden="true" />
          {t("common.download")}
        </Button>
      )}
    </SettingRow>
  );
}
