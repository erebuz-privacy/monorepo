import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@erebuz/ui/lib/utils";

/**
 * cult-ui GradientHeading — a metallic/silver clipped-gradient title. Vendored
 * from the cult-ui registry without the @radix-ui/react-slot dependency: instead
 * of `asChild`, pass a polymorphic `as` (e.g. `as="h1"`). Defaults to `h3`.
 *
 * Adds a wall8 `brand` variant (mint) on top of the stock silver variants.
 */
const headingVariants = cva("bg-clip-text tracking-apple text-transparent", {
  variants: {
    variant: {
      default:
        "bg-gradient-to-t from-neutral-700 to-neutral-900 dark:from-neutral-400 dark:to-white",
      brand:
        "bg-gradient-to-t from-brand/80 to-brand dark:from-brand/70 dark:to-brand",
      light: "bg-gradient-to-t from-neutral-200 to-neutral-300",
      secondary:
        "bg-gradient-to-t from-neutral-500 to-neutral-700 dark:from-neutral-500 dark:to-neutral-300",
    },
    size: {
      default: "text-2xl sm:text-3xl lg:text-4xl",
      xxs: "text-base sm:text-lg",
      xs: "text-lg sm:text-xl",
      sm: "text-xl sm:text-2xl",
      md: "text-2xl sm:text-3xl",
      lg: "text-3xl sm:text-4xl lg:text-5xl",
      xl: "text-4xl sm:text-5xl lg:text-6xl",
    },
    weight: {
      thin: "font-thin",
      base: "font-normal",
      medium: "font-medium",
      semi: "font-semibold",
      bold: "font-bold",
      black: "font-black",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
    weight: "semi",
  },
});

export interface GradientHeadingProps
  extends Omit<React.HTMLAttributes<HTMLHeadingElement>, "color">,
    VariantProps<typeof headingVariants> {
  /** Element to render — defaults to `h3`. */
  as?: React.ElementType;
  children: React.ReactNode;
}

function GradientHeading({
  as: Comp = "h3",
  variant,
  weight,
  size,
  className,
  children,
  ...props
}: GradientHeadingProps) {
  return (
    <Comp className={cn("w-fit", className)} {...props}>
      <span className={cn(headingVariants({ variant, size, weight }))}>
        {children}
      </span>
    </Comp>
  );
}

export { GradientHeading, headingVariants };
