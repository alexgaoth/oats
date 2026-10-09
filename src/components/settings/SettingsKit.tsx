import * as React from "react";
import { cn } from "../lib/utils";

/**
 * The parts every Settings page is built from, so all of them read the same:
 * a page title, sections of grouped rows on cards, and in each row the label and
 * what it does on the left and the control on the right — the layout macOS
 * System Settings, Linear and Raycast share.
 */

export function SettingsPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}

export function SettingsSection({
  title,
  description,
  children,
  className,
  footer,
}: {
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** A line under the card: a caveat, or what a choice means. */
  footer?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={cn("mb-8 last:mb-0", className)}>
      {(title || description) && (
        <div className="mb-3 px-1">
          {title && (
            <h3 id={id} className="text-sm font-semibold text-foreground">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {children}
      </div>
      {footer && <p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">{footer}</p>}
    </section>
  );
}

/**
 * One setting. `htmlFor` ties the label to its control, so clicking the words
 * operates it and a screen reader names the control by them.
 */
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  stacked = false,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
  /** The control goes under the words instead of beside them (wide controls). */
  stacked?: boolean;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div
      className={cn(
        "flex gap-x-6 gap-y-3 px-5 py-4",
        stacked ? "flex-col" : "items-center justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {label}
        </Label>
        {description && (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {children !== undefined && (
        <div className={cn("flex min-w-0 items-center gap-2", stacked ? "w-full" : "shrink-0")}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A status line inside a section card: what is true right now. */
export function SettingStatus({
  tone = "muted",
  icon: Icon,
  children,
}: {
  tone?: "muted" | "success" | "warning" | "danger";
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px]",
        tone === "success" && "text-success",
        tone === "warning" && "text-warning",
        tone === "danger" && "text-destructive",
        tone === "muted" && "text-muted-foreground"
      )}
    >
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {children}
    </span>
  );
}

export interface SettingsNavItem<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
}

/** The list of Settings pages, on the left of the Settings view. */
export function SettingsNav<T extends string>({
  items,
  active,
  onSelect,
  label,
}: {
  items: SettingsNavItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      {items.map(({ id, label: text, icon: Icon }) => {
        const current = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm outline-none transition-colors",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              current
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn("size-4 shrink-0", current ? "text-brand-ink" : "text-muted-foreground")}
            />
            <span className="truncate">{text}</span>
          </button>
        );
      })}
    </nav>
  );
}
