"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@erebuz/ui/lib/utils";

/**
 * cult-ui TextureButton — a tactile, double-gradient button with layered borders.
 * Vendored from the cult-ui registry without @radix-ui/react-slot (no `asChild`).
 * Adds a wall8 `brand` (mint) variant used for the primary transfer CTA.
 *
 * Compose it as: <TextureButton variant="brand" size="lg">Continue</TextureButton>
 */
const outerVariants = cva(
  "group/tex block w-full cursor-pointer transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100",
  {
  variants: {
    variant: {
      brand:
        "border border-black/10 bg-gradient-to-b from-brand/70 to-brand p-px dark:border-neutral-950",
      primary:
        "border border-black/10 bg-gradient-to-b from-neutral-800 to-black p-px dark:border-black dark:from-white dark:to-white/80",
      secondary:
        "border border-black/20 bg-white/50 p-px dark:border-neutral-950 dark:bg-neutral-600/50",
      minimal:
        "border border-black/15 bg-white/50 p-px dark:border-neutral-950 dark:bg-neutral-700/50",
    },
    size: {
      sm: "rounded-[8px]",
      default: "rounded-[12px]",
      lg: "rounded-[14px]",
    },
  },
  defaultVariants: { variant: "brand", size: "default" },
});

const innerVariants = cva(
  "flex w-full items-center justify-center gap-2 font-medium transition duration-300 disabled:opacity-60",
  {
    variants: {
      variant: {
        brand:
          "bg-gradient-to-b from-brand to-brand/90 text-brand-foreground group-hover/tex:from-brand/90 group-hover/tex:to-brand/80 group-active/tex:from-brand group-active/tex:to-brand",
        primary:
          "bg-gradient-to-b from-neutral-800 to-black text-white/90 group-hover/tex:from-neutral-700 group-hover/tex:to-neutral-900 dark:from-neutral-100 dark:to-white dark:text-black/80 dark:group-hover/tex:from-white dark:group-hover/tex:to-neutral-200",
        secondary:
          "bg-gradient-to-b from-neutral-100/80 to-neutral-200/50 text-foreground group-hover/tex:to-neutral-300/60 dark:from-neutral-800 dark:to-neutral-700/50 dark:group-hover/tex:from-neutral-700",
        minimal:
          "bg-gradient-to-b from-white to-neutral-50/60 text-foreground group-hover/tex:from-neutral-50 dark:from-neutral-800 dark:to-neutral-700/50 dark:group-hover/tex:from-neutral-700",
      },
      size: {
        sm: "rounded-[7px] px-4 py-1.5 text-xs",
        default: "rounded-[11px] px-4 py-2 text-sm",
        lg: "rounded-[13px] px-5 py-3 text-sm",
      },
    },
    defaultVariants: { variant: "brand", size: "default" },
  }
);

export interface TextureButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof outerVariants> {}

const TextureButton = React.forwardRef<HTMLButtonElement, TextureButtonProps>(
  ({ children, variant, size, className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(outerVariants({ variant, size }), className)}
      {...props}
    >
      <span className={cn(innerVariants({ variant, size }))}>{children}</span>
    </button>
  )
);
TextureButton.displayName = "TextureButton";

export { TextureButton, outerVariants as textureButtonVariants };
