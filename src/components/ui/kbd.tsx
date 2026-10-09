import * as React from "react";

import { cn } from "../lib/utils";

// A keyboard shortcut, set the way macOS menus set them.
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded border border-border bg-muted px-1.5",
        "font-sans text-[11px] font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
