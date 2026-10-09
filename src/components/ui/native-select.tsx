import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../lib/utils";

// shadcn/ui (new-york) native select: the system menu, in the same box, height
// and focus ring as Input — for a plain list of options, where a custom popover
// would add nothing but code.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative inline-flex w-fit min-w-0", className)}>
      <select
        data-slot="native-select"
        className={cn(
          "h-9 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-8 text-sm text-foreground shadow-xs",
          "outline-none transition-[color,box-shadow,border-color] dark:bg-input/20 dark:hover:bg-input/40",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
