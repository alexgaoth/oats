import { X } from "lucide-react";
import { Button } from "./ui/button";
import { OatsMark } from "./shell/OatsMark";
import { cn } from "./lib/utils";

interface MeetingNotificationCardProps {
  title: string;
  body: string;
  startLabel: string;
  onStart?: () => void;
  onDismiss?: () => void;
  /** Controls the close button's hover fade. Ignored when `onDismiss` is absent. */
  closeVisible?: boolean;
  /** The close button's accessible name, translated by the caller. */
  dismissLabel?: string;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Presentational only — shared by the live always-on-top overlay
 * (`MeetingNotificationOverlay`) and the onboarding preview so the two never
 * drift. Behaviour (slide animation, IPC, hover) is layered on by the caller
 * via `className` and the handler props.
 */
export function MeetingNotificationCard({
  title,
  body,
  startLabel,
  onStart,
  onDismiss,
  closeVisible = true,
  dismissLabel,
  className = "",
  onMouseEnter,
  onMouseLeave,
}: MeetingNotificationCardProps) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg",
        className
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Top-left on hover, where macOS puts a notification's close. */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            "absolute -left-2 -top-2 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm outline-none transition-opacity duration-150 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
            closeVisible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}

      <OatsMark className="size-8" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-[13px] text-muted-foreground">{body}</p>
      </div>
      <Button size="sm" onClick={onStart} className="shrink-0">
        {startLabel}
      </Button>
    </div>
  );
}
