import { Loader2 } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

/** Centered spinner for route guards and hydration gates. */
export function FullScreenLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-dvh items-center justify-center", className)}>
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}
