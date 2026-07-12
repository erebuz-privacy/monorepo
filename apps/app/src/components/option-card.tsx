import { Loader2, type LucideIcon } from "lucide-react";

import { Badge } from "@erebuz/ui/components/badge";
import { cn } from "@erebuz/ui/lib/utils";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/**
 * Selectable option card (e.g. the custody choices). One component so the
 * managed/self-custody cards look identical on the welcome and method screens.
 */
export function OptionCard({
  icon: Icon,
  title,
  badge,
  badgeVariant = "success",
  description,
  onClick,
  disabled,
  loading,
}: {
  icon: LucideIcon;
  title: string;
  badge?: string;
  badgeVariant?: BadgeVariant;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const body = (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          disabled ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
        )}
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );

  if (disabled) {
    return (
      <div
        aria-disabled
        className="border-border/60 bg-card/40 w-full cursor-not-allowed rounded-xl border p-4 text-left opacity-60"
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="group border-border bg-card hover:border-primary/60 hover:bg-accent/40 w-full rounded-xl border p-4 text-left transition-colors disabled:opacity-70"
    >
      {body}
    </button>
  );
}
