import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { formatETA, type DownloadProgress } from "../../hooks/useModelDownload";

interface DownloadProgressBarProps {
  modelName: string;
  progress: DownloadProgress;
  isInstalling?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)}KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)}GB`;
}

/**
 * One download row: what is downloading, how far it is, and how fast. A
 * spinner only while the size is unknown or the files are being installed,
 * because then there is no percentage to show (DESIGN.md §7).
 */
export function DownloadProgressBar({
  modelName,
  progress,
  isInstalling,
}: DownloadProgressBarProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const { percentage, downloadedBytes, totalBytes, speed, eta } = progress;
  const pct = Math.round(percentage);
  const speedText = speed ? `${speed.toFixed(1)} MB/s` : "";
  const etaText = eta ? formatETA(eta) : "";
  const indeterminate = !isInstalling && totalBytes === 0 && downloadedBytes > 0;
  const busy = isInstalling || indeterminate;
  const detail = isInstalling
    ? ""
    : [indeterminate ? formatBytes(downloadedBytes) : "", speedText, etaText]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="border-b border-border px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        {busy && (
          <Loader2
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
          />
        )}
        <p id={labelId} className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {isInstalling
            ? t("models.progress.installing", { name: modelName })
            : t("models.progress.downloading", { name: modelName })}
        </p>
        {!busy && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
        )}
      </div>

      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={busy ? undefined : pct}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {indeterminate ? (
          <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:animate-none" />
        ) : (
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-[width] duration-300 ease-out",
              isInstalling && "animate-pulse motion-reduce:animate-none"
            )}
            style={{ width: `${isInstalling ? 100 : Math.min(percentage, 100)}%` }}
          />
        )}
      </div>

      {detail && <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">{detail}</p>}
    </div>
  );
}
