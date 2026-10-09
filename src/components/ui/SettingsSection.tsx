import React from "react";
import { useSettingsLayout } from "./useSettingsLayout";
import type { InferenceMode } from "../../types/electron";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  children,
  className = "",
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="px-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
};

interface SettingsGroupProps {
  title?: string;
  children: React.ReactNode;
  variant?: "default" | "highlighted";
  className?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  children,
  variant = "default",
  className = "",
}) => {
  const baseClasses = "space-y-3 rounded-xl border p-4 shadow-xs";
  const variantClasses = {
    default: "border-border bg-card",
    highlighted: "border-primary/30 bg-primary/5",
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {title && <h4 className="text-sm font-medium text-foreground">{title}</h4>}
      {children}
    </div>
  );
};

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  description,
  children,
  className = "",
}) => {
  const { isCompact } = useSettingsLayout();

  return (
    <div
      className={`flex ${
        isCompact ? "flex-col items-start gap-3" : "items-center justify-between gap-6"
      } ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      <div className={isCompact ? "" : "shrink-0"}>{children}</div>
    </div>
  );
};

export function SettingsPanel({
  children,
  className = "",
  role,
}: {
  children: React.ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <div
      role={role}
      className={`divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs ${className}`}
    >
      {children}
    </div>
  );
}

export function SettingsPanelRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isCompact } = useSettingsLayout();

  return <div className={`${isCompact ? "px-4 py-3" : "px-5 py-4"} ${className}`}>{children}</div>;
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3 px-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export interface InferenceModeOption {
  id: InferenceMode;
  disabled?: boolean;
  badge?: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export function InferenceModeSelector({
  modes,
  activeMode,
  onSelect,
}: {
  modes: InferenceModeOption[];
  activeMode: InferenceMode;
  onSelect: (mode: InferenceMode) => void;
}) {
  return (
    <SettingsPanel className="overflow-hidden" role="radiogroup">
      {modes.map((mode) => {
        const isActive = activeMode === mode.id;
        const isDisabled = !!mode.disabled;
        return (
          <SettingsPanelRow
            key={mode.id}
            className={`transition-colors ${isDisabled ? "" : "hover:bg-muted/50"}`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={isDisabled}
              onClick={() => onSelect(mode.id)}
              className={`group flex w-full cursor-pointer items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed ${
                isDisabled ? "opacity-60" : ""
              }`}
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isActive ? "bg-primary/15 text-brand-ink" : "bg-muted text-muted-foreground"
                }`}
              >
                {mode.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{mode.label}</span>
                  {isDisabled && mode.badge && (
                    <span className="rounded-md bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground">
                      {mode.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                  {mode.description}
                </p>
              </div>
              <div
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isActive ? "border-primary bg-primary" : "border-input"
                }`}
              >
                {isActive && <div className="size-1.5 rounded-full bg-primary-foreground" />}
              </div>
            </button>
          </SettingsPanelRow>
        );
      })}
    </SettingsPanel>
  );
}
