import { ChevronDown } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

export function SelectorRow({
  label,
  value,
  sublabel,
  icon,
  placeholder,
  onClick,
  className,
}: {
  label: string;
  value?: string;
  sublabel?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-border hover:bg-accent/40 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        className
      )}
    >
      {value && icon ? icon : null}
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-xs">{label}</span>
        <span
          className={cn(
            "block truncate text-sm font-medium",
            !value && "text-muted-foreground"
          )}
        >
          {value ?? placeholder}
        </span>
        {sublabel ? (
          <span className="text-muted-foreground block truncate text-xs">
            {sublabel}
          </span>
        ) : null}
      </span>
      <ChevronDown className="text-muted-foreground size-4 shrink-0" />
    </button>
  );
}
