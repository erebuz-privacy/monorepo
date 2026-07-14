"use client";

import { AlertCircle, RotateCw } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

/**
 * Inline error card matching the app's rounded-2xl card language. Rendered
 * next to the action that failed, with an optional retry.
 */
export function ErrorNote({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/25 bg-destructive/8 animate-step-in rounded-2xl border p-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="bg-destructive/12 text-destructive flex size-8 shrink-0 items-center justify-center rounded-full">
          <AlertCircle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {title ? <p className="text-sm font-medium">{title}</p> : null}
          <p className={cn("text-muted-foreground text-sm leading-relaxed", title && "mt-0.5")}>
            {message}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-foreground hover:bg-accent border-border mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <RotateCw className="size-3" />
              {retryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
