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

export type PickerItem = {
  id: string;
  label: string;
  sublabel?: string;
  right?: string;
  icon?: React.ReactNode;
};

export function AssetPicker({
  open,
  onOpenChange,
  title,
  description,
  items,
  onSelect,
  searchPlaceholder = "Search…",
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: PickerItem[];
  onSelect: (id: string) => void;
  searchPlaceholder?: string;
  footer?: React.ReactNode;
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
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="px-4 pb-3">
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

        <div className="border-border max-h-[50vh] overflow-y-auto border-t">
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
