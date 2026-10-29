import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Cpu, KeyRound } from "lucide-react";
import { cn } from "../lib/utils";
import { getCachedPlatform } from "../../utils/platform";
import type { ProcessingMode } from "./processing";

/**
 * The one processing choice, drawn the same in Settings › AI models and in
 * setup: two options, on this Mac or with an API key. A radio group to
 * assistive tech, moved with the arrow keys like every Oats choice. What an
 * option means in a place (the downloads setup starts, the key field) goes in
 * `details`, under the group, for the option that is chosen.
 */
export function ProcessingChoice({
  value,
  onChange,
  details,
  layout = "row",
  className,
  "aria-labelledby": labelledBy,
}: {
  value: ProcessingMode | "mixed";
  onChange: (mode: ProcessingMode) => void;
  details?: Partial<Record<ProcessingMode, React.ReactNode>>;
  /** Side by side (Settings), or one above the other (setup's narrow column). */
  layout?: "row" | "column";
  className?: string;
  "aria-labelledby"?: string;
}) {
  const { t } = useTranslation();
  const mac = getCachedPlatform() === "darwin";
  const options: { mode: ProcessingMode; icon: typeof Cpu; title: string; description: string }[] =
    [
      {
        mode: "local",
        icon: Cpu,
        title: mac
          ? t("oats.settings.processingLocal")
          : t("oats.settings.processingLocalComputer"),
        description: mac
          ? t("oats.settings.processingLocalDescription")
          : t("oats.settings.processingLocalDescriptionComputer"),
      },
      {
        mode: "providers",
        icon: KeyRound,
        title: t("oats.settings.processingProviders"),
        description: t("oats.settings.processingProvidersDescription"),
      },
    ];
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // "Mixed" selects neither; the first option takes the tab stop.
  const index = Math.max(
    0,
    options.findIndex((option) => option.mode === value)
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
    const next = (index + step + options.length) % options.length;
    onChange(options[next].mode);
    refs.current[next]?.focus();
  };
  const detail = value === "mixed" ? null : details?.[value];

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : t("oats.settings.processing")}
        onKeyDown={onKeyDown}
        className={cn("grid gap-3", layout === "row" && "sm:grid-cols-2")}
      >
        {options.map((option, position) => {
          const selected = option.mode === value;
          const Icon = option.icon;
          return (
            <button
              key={option.mode}
              ref={(node) => {
                refs.current[position] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={position === index ? 0 : -1}
              onClick={() => onChange(option.mode)}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-xs outline-none",
                "transition-[border-color,background-color,box-shadow] duration-150",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  selected ? "border-primary bg-primary" : "border-input"
                )}
              >
                {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Icon
                    aria-hidden="true"
                    className={cn("size-4", selected ? "text-brand-ink" : "text-muted-foreground")}
                  />
                  {option.title}
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {detail && <div className="mt-3">{detail}</div>}
    </div>
  );
}

/**
 * What goes to the provider with an API key, said where that choice is made
 * (Settings and setup), closed until somebody asks: the audio with an OpenAI
 * key, and what the writing model reads (docs/network-allowlist.md).
 */
export function WhatIsSent() {
  const { t } = useTranslation();
  return (
    <details className="group px-1">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
        />
        {t("oats.models.whatIsSent")}
      </summary>
      <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
        <p>{t("oats.models.speechSent")}</p>
        <p>{t("oats.settings.models.writingScreen")}</p>
      </div>
    </details>
  );
}
