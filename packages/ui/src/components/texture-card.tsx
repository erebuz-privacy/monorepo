import * as React from "react";

import { cn } from "@erebuz/ui/lib/utils";

/**
 * cult-ui TextureCard — a premium multi-border container that reads with real
 * depth in dark mode. Vendored from the cult-ui registry (theme-aware variant),
 * with no external deps. The inner wrapper sets `text-neutral-500`, so re-assert
 * `text-foreground` on your content when you need default text color.
 *
 * Radii step down from `--radius` so the nested borders stay concentric.
 */
const TextureCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[calc(var(--radius)*1.8)] border border-white/60 dark:border-border/30",
        className
      )}
      {...props}
    >
      <div className="rounded-[calc(var(--radius)*1.8-1px)] border border-black/10 dark:border-neutral-900/80">
        <div className="rounded-[calc(var(--radius)*1.8-2px)] border border-white/50 dark:border-neutral-950">
          <div className="rounded-[calc(var(--radius)*1.8-3px)] border border-neutral-950/20 dark:border-neutral-900/70">
            <div className="w-full rounded-[calc(var(--radius)*1.8-4px)] border border-white/50 bg-gradient-to-b from-card/70 to-secondary/50 text-neutral-500 dark:border-neutral-700/50">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
TextureCard.displayName = "TextureCard";

const TextureCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1 px-6 pt-6", className)}
    {...props}
  />
));
TextureCardHeader.displayName = "TextureCardHeader";

const TextureCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg leading-tight font-semibold text-foreground",
      className
    )}
    {...props}
  />
));
TextureCardTitle.displayName = "TextureCardTitle";

const TextureCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
TextureCardDescription.displayName = "TextureCardDescription";

const TextureCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-6 py-4", className)} {...props} />
));
TextureCardContent.displayName = "TextureCardContent";

const TextureCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-2 px-6 py-4", className)}
    {...props}
  />
));
TextureCardFooter.displayName = "TextureCardFooter";

/** A theme-aware hairline that reads as an embossed groove. */
const TextureSeparator = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "border border-r-transparent border-l-transparent border-t-neutral-50 border-b-neutral-300/50 dark:border-t-neutral-950 dark:border-b-neutral-700/50",
      className
    )}
  />
);
TextureSeparator.displayName = "TextureSeparator";

export {
  TextureCard,
  TextureCardHeader,
  TextureCardFooter,
  TextureCardTitle,
  TextureSeparator,
  TextureCardDescription,
  TextureCardContent,
};
