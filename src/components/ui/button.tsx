import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

// shadcn/ui (new-york) buttons. Every variant shares one height scale, one
// radius and one focus ring, so a button reads as a button wherever it sits.
// Variant names are kept from the inherited set so existing call sites compile.
const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium",
    "transition-[color,background-color,border-color,box-shadow] duration-150",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/30",
        success: "bg-success text-success-foreground shadow-xs hover:bg-success/90",
        record:
          "bg-recording text-recording-foreground shadow-xs hover:bg-recording/90 focus-visible:ring-recording/30",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/20 dark:hover:bg-input/40",
        "outline-flat":
          "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/60",
        link: "h-auto px-0 text-foreground underline-offset-4 hover:underline",
        social:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
