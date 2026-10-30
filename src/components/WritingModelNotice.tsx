import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { useToast } from "./ui/useToast";
import { useDeviceTierStore } from "../stores/deviceTierStore";
import { cancelWritingModel, formatGigabytes, writingModelName } from "../hooks/useWritingModel";
import { getLocalModel } from "../models/ModelRegistry";
import { shouldShowWritingNotice, WRITING_NOTICE_KEY } from "../helpers/writingTier.mjs";

/** Long enough to read and act on; hovering holds it (Toast.tsx). */
const NOTICE_MS = 15_000;

const noticed = () => {
  try {
    return localStorage.getItem(WRITING_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * The writing model's download, said where the person is when Oats starts it
 * by itself: a toast, once per install, after setup on a new install that left
 * it for later, or at the first launch of this version on an existing one. It
 * names the model, the size and the host, and Cancel is the remembered no
 * (Oats does not fetch it again by itself). Never during a recording: the
 * download waits for the recording to end (useWritingModelDownload). Headless;
 * mounted once in the workspace, inside the ToastProvider, beside
 * SpeechUpgradeNotice.
 */
export default function WritingModelNotice() {
  const { t, i18n } = useTranslation();
  const { toast, dismiss } = useToast();
  const autoStarted = useDeviceTierStore((state) => state.writingAutoStarted);
  const modelId = useDeviceTierStore((state) => state.tier?.writing?.downloading?.modelId ?? null);
  const shown = useRef<string | null>(null);
  // `dismiss` changes with every toast; the effects and the button read the latest.
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  useEffect(() => {
    if (!modelId) return;
    if (!shouldShowWritingNotice({ noticed: noticed(), autoStarted, downloading: true })) return;
    try {
      localStorage.setItem(WRITING_NOTICE_KEY, "1");
    } catch {
      // Without storage it shows once per launch instead.
    }
    const id = toast({
      title: t("oats.writingModel.noticeTitle", {
        model: writingModelName(modelId),
        size: formatGigabytes(getLocalModel(modelId)?.sizeBytes, i18n.language),
      }),
      description: t("oats.writingModel.noticeDetail"),
      duration: NOTICE_MS,
      action: (
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            cancelWritingModel();
            dismissRef.current(id);
          }}
        >
          {t("common.cancel")}
        </Button>
      ),
    });
    shown.current = id;
  }, [autoStarted, modelId, toast, t, i18n.language]);

  // The download ended (ready, cancelled in Settings, or failed): the notice
  // has nothing left to say.
  useEffect(() => {
    if (modelId || !shown.current) return;
    dismissRef.current(shown.current);
    shown.current = null;
  }, [modelId]);

  return null;
}
