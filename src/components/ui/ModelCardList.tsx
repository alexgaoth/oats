import { Check, Globe, Download, Loader2, Trash2, X, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { cn } from "../lib/utils";
import type { ColorScheme } from "../../utils/modelPickerStyles";
import { createExternalLinkHandler, withUtm } from "../../utils/externalLinks";

export interface ModelCardOption {
  value: string;
  label: string;
  description?: string;
  specUrl?: string;
  icon?: string;
  invertInDark?: boolean;
  // Explicit group for SearchableModelList; falls back to the "provider/"
  // prefix of `value` when absent (e.g. Bedrock ids carry no slash).
  group?: string;
  // Local model properties (optional)
  isDownloaded?: boolean;
  isDownloading?: boolean;
  recommended?: boolean;
}

interface ModelCardProps {
  model: ModelCardOption;
  isSelected: boolean;
  onSelect: (modelId: string) => void;
  colorScheme?: ColorScheme;
  // Long-form descriptions (e.g. OpenRouter) fill the row and ellipsize
  // instead of sitting flush-right like short metadata.
  truncateDescription?: boolean;
  // Local model actions (optional - when provided, enables local model UI)
  onDownload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onCancelDownload?: () => void;
  isCancelling?: boolean;
}

export function ModelCard({
  model,
  isSelected,
  onSelect,
  colorScheme = "purple",
  truncateDescription = false,
  onDownload,
  onDelete,
  onCancelDownload,
  isCancelling = false,
}: ModelCardProps) {
  const { t } = useTranslation();
  const isLocalMode = Boolean(onDownload);
  const isDownloaded = model.isDownloaded;
  const isDownloading = model.isDownloading;
  const specHref = model.specUrl ? withUtm(model.specUrl, "model_spec") : undefined;

  const handleCardClick = () => {
    if (isLocalMode) {
      if (isDownloaded && !isSelected) {
        onSelect(model.value);
      }
    } else {
      onSelect(model.value);
    }
  };

  // Selectable once it is on this Mac (or always, for a cloud model).
  const selectable = !isLocalMode || Boolean(isDownloaded);

  return (
    <div
      role="radio"
      aria-checked={isSelected}
      aria-disabled={!selectable || undefined}
      tabIndex={selectable ? 0 : -1}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && selectable) {
          event.preventDefault();
          handleCardClick();
        }
      }}
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors",
        "focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
        isSelected ? "bg-primary/[0.06]" : selectable ? "hover:bg-muted/50" : "",
        selectable && !isSelected ? "cursor-pointer" : ""
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          isSelected ? "border-primary bg-primary" : "border-input",
          !selectable && "opacity-40"
        )}
      >
        {isSelected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
      </span>

      {model.icon ? (
        <img
          src={model.icon}
          alt=""
          className={`size-4 shrink-0 ${model.invertInDark ? "icon-monochrome" : ""}`}
          aria-hidden="true"
        />
      ) : (
        <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}

      <span
        className={cn(
          "truncate text-sm font-medium text-foreground",
          truncateDescription && (model.description ? "max-w-[60%] shrink-0" : "min-w-0 flex-1")
        )}
      >
        {model.label}
      </span>
      {model.description && (
        <span
          className={
            truncateDescription
              ? "min-w-0 flex-1 truncate text-[13px] text-muted-foreground"
              : "shrink-0 text-[13px] tabular-nums text-muted-foreground"
          }
        >
          {model.description}
        </span>
      )}
      {specHref && (
        <a
          href={specHref}
          onClick={createExternalLinkHandler(specHref)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-[13px] text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {t("models.learnMore")}
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      )}
      {model.recommended && (
        <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-brand-ink">
          {t("common.recommended")}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {isLocalMode && (
          <>
            {isDownloaded ? (
              <>
                <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
                  <Check aria-hidden="true" className="size-3.5 text-success" />
                  {t("models.downloaded")}
                </span>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(model.value);
                  }}
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("models.delete", { model: model.label })}
                  className="size-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </>
            ) : isDownloading ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
                />
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelDownload?.();
                  }}
                  disabled={isCancelling}
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                >
                  <X aria-hidden="true" />
                  {isCancelling ? "…" : t("common.cancel")}
                </Button>
              </>
            ) : (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload?.(model.value);
                }}
                size="sm"
                variant="outline"
              >
                <Download aria-hidden="true" />
                {t("common.download")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ModelCardListProps {
  models: ModelCardOption[];
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  colorScheme?: ColorScheme;
  className?: string;
  truncateDescription?: boolean;
  // Local model actions (optional - when provided, enables local model UI)
  onDownload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onCancelDownload?: () => void;
  isCancelling?: boolean;
}

export default function ModelCardList({
  models,
  selectedModel,
  onModelSelect,
  colorScheme = "purple",
  className = "",
  truncateDescription = false,
  onDownload,
  onDelete,
  onCancelDownload,
  isCancelling = false,
}: ModelCardListProps) {
  const { t } = useTranslation();

  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">{t("models.noneAvailable")}</p>;
  }

  return (
    <div
      role="radiogroup"
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className
      )}
    >
      {models.map((model) => (
        <ModelCard
          key={model.value}
          model={model}
          isSelected={selectedModel === model.value}
          onSelect={onModelSelect}
          colorScheme={colorScheme}
          truncateDescription={truncateDescription}
          onDownload={onDownload}
          onDelete={onDelete}
          onCancelDownload={onCancelDownload}
          isCancelling={isCancelling}
        />
      ))}
    </div>
  );
}
