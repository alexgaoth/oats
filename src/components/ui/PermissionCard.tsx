import { Button } from "./button";
import { Check, LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface PermissionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  granted: boolean;
  onRequest: () => void;
  buttonText?: string;
  badge?: string;
  hint?: string;
}

export default function PermissionCard({
  icon: Icon,
  title,
  description,
  granted,
  onRequest,
  buttonText = "Grant Access",
  badge,
  hint,
}: PermissionCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors duration-150",
        granted ? "border-success/25" : "border-border"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
            granted ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          )}
        >
          {granted ? (
            <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
          ) : (
            <Icon aria-hidden="true" className="size-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
            {title}
            {badge && (
              <span className="rounded-md bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground">
                {badge}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
        </div>

        {!granted && (
          <Button onClick={onRequest} size="sm" className="shrink-0">
            {buttonText}
          </Button>
        )}
      </div>

      {hint && !granted && <p className="mt-2 pl-12 text-xs leading-5 text-warning">{hint}</p>}
    </div>
  );
}
