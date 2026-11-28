import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Cpu, KeyRound, Split } from "lucide-react";
import { cn } from "../lib/utils";
import { getCachedPlatform } from "../../utils/platform";
import type { ProcessingMode } from "./processing";
import { useShallow } from "zustand/react/shallow";
import { FEATURES } from "../../helpers/featureRoutes.mjs";
import {
  macRunsRoomParakeet,
  selectFeatureRoute,
  selectRoomsOnThisMac,
  useSettingsStore,
} from "../../stores/settingsStore";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import { useRoomModelStore } from "../../stores/roomModelStore";
import { getProviderDisplayName } from "../../models/ModelRegistry";
import { featureRouteDisclosure, featureRouteName } from "./featureRouteCopy";

type Shown = ProcessingMode | "mixed";

/**
 * The one processing choice, drawn the same in Settings › AI models and in
 * setup: on this Mac or with an API key. A radio group to assistive tech,
 * moved with the arrow keys like every Oats choice. What an option means in a
 * place (the downloads setup starts, the key field) goes in `details`, under
 * the group, for the option that is chosen.
 *
 * While the features run in different places (`value` "mixed", from a row's
 * place menu in Your models), a third card, Mixed, opens between the two and
 * is the checked one. It is a state, not a choice: pressing it changes
 * nothing, and either other card puts every feature there, so Mixed closes.
 * It opens and closes over `--motion-base` by its width and opacity, the two
 * cards moving apart and together (Alex, 2026-11-22); under reduced motion it
 * simply appears and goes.
 */
export function ProcessingChoice({
  value,
  onChange,
  details,
  showDescriptions = true,
  layout = "row",
  className,
  "aria-labelledby": labelledBy,
}: {
  value: Shown;
  onChange: (mode: ProcessingMode) => void;
  details?: Partial<Record<ProcessingMode, React.ReactNode>>;
  showDescriptions?: boolean;
  /** Side by side (Settings), or one above the other (setup's narrow column). */
  layout?: "row" | "column";
  className?: string;
  "aria-labelledby"?: string;
}) {
  const { t } = useTranslation();
  const mac = getCachedPlatform() === "darwin";
  const options: Record<Shown, { icon: typeof Cpu; title: string; description: string }> = {
    local: {
      icon: Cpu,
      title: mac ? t("oats.settings.processingLocal") : t("oats.settings.processingLocalComputer"),
      description: mac
        ? t("oats.settings.processingLocalDescription")
        : t("oats.settings.processingLocalDescriptionComputer"),
    },
    mixed: {
      icon: Split,
      title: t("oats.settings.processingMixedTitle"),
      description: t("oats.settings.processingMixedDescription"),
    },
    providers: {
      icon: KeyRound,
      title: t("oats.settings.processingProviders"),
      description: t("oats.settings.processingProvidersDescription"),
    },
  };
  const mixed = value === "mixed";
  const refs = React.useRef<Partial<Record<Shown, HTMLButtonElement | null>>>({});
  // The arrows move between the two choices. From Mixed, back or up is On
  // this Mac and forward or down is With an API key.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const from = (Object.keys(refs.current) as Shown[]).find(
      (mode) => refs.current[mode] === event.target
    );
    const next: ProcessingMode =
      from === "mixed" || from === undefined
        ? step > 0
          ? "providers"
          : "local"
        : from === "local"
          ? "providers"
          : "local";
    onChange(next);
    refs.current[next]?.focus();
  };
  const detail = mixed ? null : details?.[value];

  const card = (mode: Shown, extra?: string) => {
    const option = options[mode];
    const selected = mode === value;
    const Icon = option.icon;
    return (
      <button
        key={mode}
        ref={(node) => {
          refs.current[mode] = node;
        }}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={selected ? 0 : -1}
        data-processing={mode}
        onClick={() => {
          if (mode !== "mixed") onChange(mode);
        }}
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-xs outline-none",
          "transition-[border-color,background-color,box-shadow] duration-150",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          selected ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
          mode === "mixed" && "cursor-default",
          extra
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
              className={cn(
                "size-4 shrink-0",
                selected ? "text-brand-ink" : "text-muted-foreground"
              )}
            />
            {option.title}
          </span>
          {showDescriptions && (
            <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">
              {option.description}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : t("oats.settings.processing")}
        onKeyDown={onKeyDown}
        className={cn(layout === "row" ? "flex items-stretch" : "grid gap-3")}
      >
        {layout === "row" ? (
          <>
            {card("local", "min-w-0 flex-1 basis-0")}
            {/* Mixed: always here, so it can open and close. Its slot grows
                from nothing and takes the gap before it with it; the card
                inside keeps to one line and is clipped while the slot is
                narrow, so nothing in it reflows as it moves. */}
            <div
              data-processing-slot="mixed"
              data-open={mixed}
              aria-hidden={!mixed || undefined}
              inert={!mixed}
              className={cn(
                "flex min-w-0 basis-0 overflow-clip [overflow-clip-margin:4px]",
                "transition-[flex-grow,margin-left,opacity] [transition-duration:var(--motion-base)] motion-reduce:transition-none",
                mixed ? "ml-3 grow opacity-100" : "ml-0 grow-0 opacity-0"
              )}
            >
              {card("mixed", "w-full whitespace-nowrap")}
            </div>
            {card("providers", "ml-3 min-w-0 flex-1 basis-0")}
          </>
        ) : (
          <>
            {card("local")}
            {mixed && card("mixed")}
            {card("providers")}
          </>
        )}
      </div>
      {detail && <div className="mt-3">{detail}</div>}
    </div>
  );
}

/**
 * What goes to the provider with an API key, said where that choice is made
 * (Settings and setup), closed until somebody asks: the audio with an OpenAI
 * key (a call's only, while rooms stay on this Mac), and what the writing
 * model reads (docs/network-allowlist.md).
 */
export function WhatIsSent({ featureRoutes = false }: { featureRoutes?: boolean }) {
  const { t } = useTranslation();
  const cloud = useSettingsStore(
    useShallow((state) =>
      FEATURES.map((feature) => {
        const route = selectFeatureRoute(state, feature);
        return route.effective === "providers" ? route.provider : null;
      })
    )
  );
  // With an API key, rooms on this Mac once Parakeet Ultra is on disk.
  const tier = useDeviceTierStore((state) => state.tier);
  const installed = useRoomModelStore((state) => state.installed);
  const roomsHere = useSettingsStore(
    (state) => selectRoomsOnThisMac(state) && macRunsRoomParakeet(state, tier) && installed
  );
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
        {featureRoutes ? (
          cloud.some(Boolean) ? (
            <ul className="space-y-1.5">
              {FEATURES.map((feature, index) =>
                cloud[index] ? (
                  <li key={feature}>
                    <strong className="font-medium text-foreground">
                      {featureRouteName(t, feature)}.{" "}
                    </strong>
                    {featureRouteDisclosure(
                      t,
                      feature,
                      getProviderDisplayName(cloud[index] ?? ""),
                      roomsHere
                    )}
                  </li>
                ) : null
              )}
            </ul>
          ) : (
            <p>{t("oats.featureRoutes.noneSent")}</p>
          )
        ) : (
          <>
            <p>{t("oats.models.speechSent")}</p>
            <p>{t("oats.settings.models.writingScreen")}</p>
          </>
        )}
      </div>
    </details>
  );
}
