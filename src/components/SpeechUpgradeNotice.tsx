import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { useToast } from "./ui/useToast";
import { useDeviceTierStore } from "../stores/deviceTierStore";
import { cancelTurbo, formatMegabytes } from "../hooks/useSpeechTier";
import { shouldShowUpgradeNotice, UPGRADE_NOTICE_KEY } from "../helpers/speechTier.mjs";

/** Long enough to read and act on; hovering holds it (Toast.tsx). */
const NOTICE_MS = 15_000;

const noticed = () => {
  try {
    return localStorage.getItem(UPGRADE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * The one download Oats starts by itself, said where the person is: a toast,
 * once per install, when Whisper Turbo starts downloading after setup (a new
 * install) or at the first launch of this version (an existing one). It names
 * the size and the host, and Cancel is the same no as the sidebar's (Oats does
 * not fetch it again by itself). Never during a recording: the download waits
 * for the recording to end (useSpeechUpgrade). Headless; mounted once in the
 * workspace, inside the ToastProvider.
 */
export default function SpeechUpgradeNotice() {
  const { t, i18n } = useTranslation();
  const { toast, dismiss } = useToast();
  const autoStarted = useDeviceTierStore((state) => state.autoStarted);
  const downloading = useDeviceTierStore((state) => Boolean(state.tier?.turbo?.downloading));
  const sizeBytes = useDeviceTierStore((state) => state.tier?.turbo?.sizeBytes ?? null);
  const shown = useRef<string | null>(null);
  // `dismiss` changes with every toast; the effects and the button read the latest.
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  useEffect(() => {
    if (!shouldShowUpgradeNotice({ noticed: noticed(), autoStarted, downloading })) return;
    try {
      localStorage.setItem(UPGRADE_NOTICE_KEY, "1");
    } catch {
      // Without storage it shows once per launch instead.
    }
    const id = toast({
      title: t("oats.speechTier.noticeTitle", { size: formatMegabytes(sizeBytes, i18n.language) }),
      description: t("oats.speechTier.noticeDetail"),
      duration: NOTICE_MS,
      action: (
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            cancelTurbo();
            dismissRef.current(id);
          }}
        >
          {t("common.cancel")}
        </Button>
      ),
    });
    shown.current = id;
  }, [autoStarted, downloading, sizeBytes, toast, t, i18n.language]);

  // The download ended (ready, cancelled in the sidebar, or failed): the
  // notice has nothing left to say.
  useEffect(() => {
    if (downloading || !shown.current) return;
    dismissRef.current(shown.current);
    shown.current = null;
  }, [downloading]);

  return null;
}
