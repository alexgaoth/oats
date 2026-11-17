import * as React from "react";

import { cn } from "../lib/utils";

// A keyboard shortcut, set the way macOS menus set them. On the background
// tone, not muted: the muted text on the muted fill measured 4.40:1.
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded border border-border bg-background px-1.5",
        "font-sans text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
