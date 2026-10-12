import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * A control's keyboard shortcut, named in its tooltip.
 *
 * The keys people reach for in the middle of a conversation wear a visible chip
 * (Mark M, Search /, Start and Stop recording). Every other control with a key
 * names it here, on hover and on focus, so the key can be found without adding
 * to the screen at rest. With no key (a shortcut cleared in Settings), the
 * control renders alone.
 */
function ShortcutTooltip({
  label,
  keys,
  children,
  side = "bottom",
  align = "center",
}: {
  label: React.ReactNode;
  /** The key as people read it (`formatHotkey`), e.g. ⌘, or Esc. */
  keys: string;
  children: React.ReactElement;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  align?: React.ComponentProps<typeof TooltipContent>["align"];
}) {
  if (!keys) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {label}
        <span className="ml-2 opacity-70">{keys}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { ShortcutTooltip };
