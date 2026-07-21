import { cn } from "@erebuz/ui/lib/utils";

/**
 * Full-height, centered column with a width-capped content well. Every top-level
 * screen (quote, method, transfer, welcome) uses this so padding + max width are
 * identical across the app.
 */
export function Screen({
  children,
  width = "md",
  className,
}: {
  children: React.ReactNode;
  width?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-10">
      <div
        className={cn(
          "page-enter w-full",
          width === "sm" ? "max-w-sm" : "max-w-md",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
