"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Search } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@erebuz/ui/components/sheet";
import { Input } from "@erebuz/ui/components/input";
import { Skeleton } from "@erebuz/ui/components/skeleton";
import { cn } from "@erebuz/ui/lib/utils";

export type PickerItem = {
  id: string;
  label: string;
  sublabel?: string;
  right?: string;
  icon?: React.ReactNode;
};

export type ChainChip = { id: string; label: string; icon?: React.ReactNode };

type Step = "chain" | "token";

/**
 * Two-step asset picker rendered as a right-side drawer: pick a network first,
 * then a token on that network. Reduces the 60+ chain set to one clear choice
 * at a time instead of a crowded chip row.
 */
export function AssetPicker({
  open,
  onOpenChange,
  title,
  items,
  onSelect,
  searchPlaceholder = "Search tokens…",
  footer,
  chains,
  activeChainId,
  onChainSelect,
  activeItemId,
  loading,
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
  activeItemId?: string;
  loading?: boolean;
}) {
  const [step, setStep] = useState<Step>("chain");
  const [query, setQuery] = useState("");

  const hasChainStep = Boolean(chains && chains.length && onChainSelect);

  // Reset to the network step each time the drawer opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(hasChainStep ? "chain" : "token");
      setQuery("");
    }
  }, [open, hasChainStep]);

  const activeChain = chains?.find((c) => c.id === activeChainId);

  const filteredChains = useMemo(() => {
    if (!chains) return [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return chains;
    return chains.filter((c) => terms.every((t) => c.label.toLowerCase().includes(t)));
  }, [chains, query]);

  const filteredItems = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.sublabel ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, query]);

  const onChain = step === "chain" && hasChainStep;

  const goToken = (chainId: string) => {
    onChainSelect?.(chainId);
    setStep("token");
    setQuery("");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <SheetContent className="gap-0 p-0">
        <SheetHeader className="pr-12">
          {onChain ? (
            <>
              <SheetTitle className="text-lg">{title}</SheetTitle>
              <SheetDescription>Choose a network</SheetDescription>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {hasChainStep ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStep("chain");
                      setQuery("");
                    }}
                    className="press hover:bg-accent -ml-1 flex cursor-pointer items-center gap-1 rounded-lg py-0.5 pr-2 pl-1 text-xs font-medium"
                  >
                    <ArrowLeft className="size-3.5" /> Networks
                  </button>
                ) : null}
              </div>
              <SheetTitle className="text-lg">Select token</SheetTitle>
              {activeChain ? (
                <SheetDescription className="flex items-center gap-1.5">
                  on {activeChain.icon} {activeChain.label}
                </SheetDescription>
              ) : null}
            </>
          )}
        </SheetHeader>

        <div className="px-5 py-4">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={onChain ? "Search networks…" : searchPlaceholder}
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="border-border flex-1 overflow-y-auto border-t">
          {onChain ? (
            filteredChains.length === 0 ? (
              <p className="text-muted-foreground p-8 text-center text-sm">No networks</p>
            ) : (
              <ul className="p-2">
                {filteredChains.map((c, i) => (
                  <li
                    key={c.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both"
                    style={{ animationDelay: `${Math.min(i, 14) * 18}ms`, animationDuration: "200ms" }}
                  >
                    <button
                      type="button"
                      onClick={() => goToken(c.id)}
                      className={cn(
                        "press flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left",
                        c.id === activeChainId ? "bg-accent" : "hover:bg-accent/70"
                      )}
                    >
                      {c.icon}
                      <span className="flex-1 truncate text-sm font-semibold">{c.label}</span>
                      {c.id === activeChainId ? <Check className="text-brand size-4 shrink-0" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : loading ? (
            <ul className="space-y-1 p-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl p-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </li>
              ))}
            </ul>
          ) : filteredItems.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">No matches</p>
          ) : (
            <ul className="p-2">
              {filteredItems.map((it, i) => {
                const selected = it.id === activeItemId;
                return (
                  <li
                    key={it.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both"
                    style={{ animationDelay: `${Math.min(i, 14) * 22}ms`, animationDuration: "220ms" }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(it.id);
                        onOpenChange(false);
                        setQuery("");
                      }}
                      className={cn(
                        "press flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left",
                        selected ? "bg-accent" : "hover:bg-accent/70"
                      )}
                    >
                      {it.icon}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{it.label}</span>
                        {it.sublabel ? (
                          <span className="text-muted-foreground block truncate text-xs">
                            {it.sublabel}
                          </span>
                        ) : null}
                      </span>
                      {it.right ? (
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {it.right}
                        </span>
                      ) : null}
                      {selected ? <Check className="text-brand size-4 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {footer && !onChain ? <div className="border-border border-t p-3">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}
