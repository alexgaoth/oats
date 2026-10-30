import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Zap } from "lucide-react";
import { Button } from "../ui/button";
import { DownloadProgressBar } from "../ui/DownloadProgressBar";
import type { DownloadProgress } from "../../hooks/useModelDownload";

/**
 * The GPU build of the speech server on Linux and Windows: CUDA with an
 * NVIDIA GPU, Vulkan with another. Offered once, downloaded on request, and
 * removable. Nothing on a Mac, whose server runs on Metal as it ships, and
 * nothing without a GPU it could use. Moved here unchanged from the speech
 * model picker, so the picker for uploads and the AI models page share it.
 */
export function WhisperAcceleration() {
  const { t } = useTranslation();
  const [backend, setBackend] = useState<"cuda" | "vulkan" | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress>({
    downloadedBytes: 0,
    totalBytes: 0,
    percentage: 0,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const detect = async () => {
      try {
        const cuda = await window.electronAPI?.getCudaWhisperStatus?.();
        if (cuda?.gpuInfo.hasNvidiaGpu) {
          setBackend("cuda");
          setDownloaded(cuda.downloaded);
          return;
        }
        const vulkan = await window.electronAPI?.getVulkanWhisperStatus?.();
        if (vulkan?.vulkan.available) {
          setBackend("vulkan");
          setDownloaded(vulkan.downloaded);
        }
      } catch {
        // No GPU build to offer.
      }
    };
    void detect();
  }, []);

  useEffect(() => {
    if (!downloading || !backend) return;
    const subscribe =
      backend === "cuda"
        ? window.electronAPI?.onCudaDownloadProgress
        : window.electronAPI?.onVulkanWhisperDownloadProgress;
    return subscribe?.((data) => setProgress(data));
  }, [downloading, backend]);

  const download = async () => {
    setDownloading(true);
    try {
      const result =
        backend === "cuda"
          ? await window.electronAPI?.downloadCudaWhisperBinary?.()
          : await window.electronAPI?.downloadVulkanWhisperBinary?.();
      if (result?.success) setDownloaded(true);
    } finally {
      setDownloading(false);
    }
  };

  const remove = async () => {
    const result =
      backend === "cuda"
        ? await window.electronAPI?.deleteCudaWhisperBinary?.()
        : await window.electronAPI?.deleteVulkanWhisperBinary?.();
    if (result?.success) setDownloaded(false);
  };

  const cancel = async () => {
    if (backend === "cuda") await window.electronAPI?.cancelCudaWhisperDownload?.();
    else await window.electronAPI?.cancelVulkanWhisperDownload?.();
    setDownloading(false);
  };

  if (downloading) {
    return (
      <div>
        <DownloadProgressBar modelName={t("models.progress.gpu")} progress={progress} />
        <div className="flex justify-end px-2.5 pb-1">
          <Button variant="ghost" size="xs" onClick={() => void cancel()}>
            {t("gpu.cancel")}
          </Button>
        </div>
      </div>
    );
  }
  if (!backend || dismissed) return null;
  if (downloaded) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[13px] text-foreground">
          <Check aria-hidden="true" className="size-3.5 text-success" />
          {t("gpu.active")}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void remove()}
          className="text-muted-foreground hover:text-destructive"
        >
          {t("gpu.remove")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <Zap aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brand-ink" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{t("gpu.transcriptionBanner")}</p>
        <div className="mt-2 flex items-center gap-2">
          <Button size="xs" variant="outline" onClick={() => void download()}>
            {t("gpu.enableButton")}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setDismissed(true)}>
            {t("gpu.dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
