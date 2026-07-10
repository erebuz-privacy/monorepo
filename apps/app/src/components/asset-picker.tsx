"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Input } from "@erebuz/ui/components/input";
import { cn } from "@erebuz/ui/lib/utils";

export type PickerItem = {
  id: string;
  label: string;
  sublabel?: string;
  right?: string;
  icon?: React.ReactNode;
};

export type ChainChip = { id: string; label: string; icon?: React.ReactNode };

export function AssetPicker({
  open,
  onOpenChange,
  title,
  description,
  items,
  onSelect,
  searchPlaceholder = "Search…",
  footer,
  chains,
  activeChainId,
  onChainSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: PickerItem[];
  onSelect: (id: string) => void;
  searchPlaceholder?: string;
  footer?: React.ReactNode;
  chains?: ChainChip[];
  activeChainId?: string;
  onChainSelect?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.sublabel ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-border border-b px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {chains && chains.length ? (
          <div className="px-5 pt-4">
            <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">
              Network
            </p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {chains.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChainSelect?.(c.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    c.id === activeChainId
                      ? "border-transparent bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {c.icon}
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="px-5 py-4">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
        </div>

        <div className="border-border max-h-[46vh] overflow-y-auto border-t">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              No matches
            </p>
          ) : (
            <ul className="p-2">
              {filtered.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(it.id);
                      onOpenChange(false);
                      setQuery("");
                    }}
                    className="hover:bg-accent flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
                  >
                    {it.icon}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {it.label}
                      </span>
                      {it.sublabel ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {it.sublabel}
                        </span>
                      ) : null}
                    </span>
                    {it.right ? (
                      <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                        {it.right}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {footer ? (
          <div className="border-border border-t p-3">{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
