import { cn } from "../lib/utils";

/** The oat grain, as an app-icon tile. The one place the brand amber appears. */
export function OatsMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      className={cn("size-5 shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1024" height="1024" rx="232" className="fill-foreground" />
      <path
        d="M512 176 C 626 316, 704 410, 704 512 C 704 626, 622 730, 512 848 C 402 730, 320 626, 320 512 C 320 410, 398 316, 512 176 Z"
        className="fill-brand"
      />
      <path
        d="M512 268 C 470 410, 470 620, 512 756"
        className="stroke-foreground"
        strokeWidth="34"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
