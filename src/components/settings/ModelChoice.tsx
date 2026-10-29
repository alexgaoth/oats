import * as React from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export interface ModelChoiceProvider {
  id: string;
  name: string;
}

export interface ModelChoiceRow {
  id: string;
  name: string;
  /** The download, for a model that runs on this Mac ("5.4 GB"). */
  size?: string;
  /** A short fact beside the name ("English", "Your server"). */
  note?: string;
  /** The one Oats would choose here. */
  recommended?: boolean;
  /**
   * - "in-use": the model Oats uses now.
   * - "ready": on disk, or a cloud model: Use.
   * - "download": not on disk: Download (and use).
   * - "downloading": with `percent`, and Cancel.
   * - "checking": downloaded and being checked; nothing to press.
   * - "failed": the last download failed: Try again.
   */
  state: "in-use" | "ready" | "download" | "downloading" | "checking" | "failed";
  percent?: number;
  /** On disk and can be removed. */
  removable?: boolean;
}

/**
 * Choosing a model yourself, the same for speech and writing: the providers
 * as pills, then one row per model with its size, whether Oats recommends it
 * here, and the one action its state has (Use, Download, Cancel, Try again),
 * and Remove for a model on this Mac. Under the pills, `children` holds what
 * the chosen provider needs first: its key, or its server's address.
 *
 * Presentational: the speech and writing choosers (SpeechModelChoice,
 * WritingModelChoice) decide the providers, the rows and what each action does.
 */
export function ModelChoice({
  title,
  description,
  action,
  providers,
  provider,
  onProvider,
  children,
  rows,
  empty,
  onUse,
  onDownload,
  onCancel,
  onRemove,
}: {
  title: string;
  description?: React.ReactNode;
  /** Beside the title: going back to Oats' choice. */
  action?: React.ReactNode;
  providers: ModelChoiceProvider[];
  provider: string;
  onProvider: (id: string) => void;
  children?: React.ReactNode;
  rows: ModelChoiceRow[];
  /** Said instead of rows when a provider has none (its panel above lists them). */
  empty?: React.ReactNode;
  onUse: (id: string) => void;
  onDownload?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="border-b border-border px-4 py-3">
          <ProviderPills
            label={t("oats.models.providers", { title })}
            providers={providers}
            value={provider}
            onChange={onProvider}
          />
        </div>
        {/* A slot whose component draws nothing (no GPU build to offer) takes no room. */}
        {children && (
          <div className="border-b border-border px-4 py-3 last:border-b-0 empty:hidden">
            {children}
          </div>
        )}
        {rows.length > 0 ? (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <ModelRowItem
                key={row.id}
                row={row}
                onUse={onUse}
                onDownload={onDownload}
                onCancel={onCancel}
                onRemove={onRemove}
              />
            ))}
          </ul>
        ) : (
          empty && (
            <div className="px-4 py-3 text-[13px] leading-5 text-muted-foreground">{empty}</div>
          )
        )}
      </div>
    </section>
  );
}

/** The providers, as pills: one of them, moved with the arrow keys. */
function ProviderPills({
  label,
  providers,
  value,
  onChange,
}: {
  label: string;
  providers: ModelChoiceProvider[];
  value: string;
  onChange: (id: string) => void;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    providers.findIndex((item) => item.id === value)
  );
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + providers.length) % providers.length;
    onChange(providers[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1.5"
    >
      {providers.map((item, position) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[position] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={position === index ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap outline-none",
              "transition-[color,background-color,border-color,box-shadow] duration-150",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

function ModelRowItem({
  row,
  onUse,
  onDownload,
  onCancel,
  onRemove,
}: {
  row: ModelChoiceRow;
  onUse: (id: string) => void;
  onDownload?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        "flex min-h-12 items-center gap-3 px-4 py-2",
        row.state === "in-use" && "bg-primary/[0.06]"
      )}
    >
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{row.name}</span>
      {row.size && (
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{row.size}</span>
      )}
      {row.note && (
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">{row.note}</span>
      )}
      {row.recommended && <Badge variant="brand">{t("common.recommended")}</Badge>}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {row.state === "in-use" && (
          <span className="flex items-center gap-1 text-[13px] text-foreground">
            <Check aria-hidden="true" className="size-3.5 text-success" />
            {t("oats.models.inUse")}
          </span>
        )}
        {row.state === "ready" && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onUse(row.id)}
            aria-label={t("oats.models.useModel", { model: row.name })}
          >
            {t("oats.models.use")}
          </Button>
        )}
        {row.state === "download" && onDownload && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onDownload(row.id)}
            aria-label={t("oats.models.downloadModel", { model: row.name })}
          >
            <Download aria-hidden="true" />
            {t("common.download")}
          </Button>
        )}
        {row.state === "failed" && onDownload && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onDownload(row.id)}
            aria-label={t("oats.models.retryModel", { model: row.name })}
          >
            <RotateCcw aria-hidden="true" />
            {t("oats.speechTier.retry")}
          </Button>
        )}
        {row.state === "downloading" && (
          <>
            <span className="text-[13px] tabular-nums text-muted-foreground">
              {t("oats.models.percent", { percent: row.percent ?? 0 })}
            </span>
            {onCancel && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onCancel(row.id)}
                aria-label={t("oats.models.cancelModel", { model: row.name })}
              >
                <X aria-hidden="true" />
                {t("common.cancel")}
              </Button>
            )}
          </>
        )}
        {row.state === "checking" && (
          <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <Loader2
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
            {t("oats.models.checking")}
          </span>
        )}
        {row.removable && onRemove && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onRemove(row.id)}
            aria-label={t("models.delete", { model: row.name })}
            title={t("models.delete", { model: row.name })}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}
