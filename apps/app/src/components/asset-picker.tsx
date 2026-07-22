"use client";

import { useMemo, useState } from "react";
import { Check, Globe2, X } from "lucide-react";

import { AnimatedSearchInput } from "@erebuz/ui/components/animated-search";
import { glassSurfaceVariants } from "@erebuz/ui/components/glass-surface";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Skeleton } from "@erebuz/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@erebuz/ui/components/tooltip";
import { cn } from "@erebuz/ui/lib/utils";

export type PickerItem = {
  id: string;
  label: string;
  sublabel?: string;
  right?: string;
  icon?: React.ReactNode;
};

export type ChainChip = { id: string; label: string; icon?: React.ReactNode };

type Mode = "tokens" | "networks";

/**
 * Search-first Superbridge-style selector with a persistent network dock.
 * The network grid is only exposed from the globe control, keeping the default
 * token-picking flow direct and visually quiet.
 */
export function AssetPicker({
  open,
  onOpenChange,
  title,
  description,
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
  const [mode, setMode] = useState<Mode>("tokens");
  const [query, setQuery] = useState("");

  const activeChain = chains?.find((chain) => chain.id === activeChainId);
  const terms = useMemo(
    () => query.toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );
  const filteredChains = useMemo(
    () =>
      (chains ?? []).filter((chain) =>
        terms.every((term) => chain.label.toLowerCase().includes(term)),
      ),
    [chains, terms],
  );
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const haystack = `${item.label} ${item.sublabel ?? ""}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      }),
    [items, terms],
  );

  const chooseChain = (id: string) => {
    onChainSelect?.(id);
    setMode("tokens");
    setQuery("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setMode("tokens");
          setQuery("");
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="text-foreground !top-1/2 !left-1/2 flex max-h-[min(82dvh,760px)] w-[calc(100vw-1rem)] !max-w-[740px] !-translate-x-1/2 !-translate-y-1/2 flex-col gap-3 overflow-visible border-0 bg-transparent p-0 opacity-100 shadow-none ring-0 transition-opacity duration-200 ease-out [animation:none!important] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:w-[min(92vw,740px)]"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {description ?? "Choose a network and asset"}
        </DialogDescription>

        <div
          className={cn(
            glassSurfaceVariants({ tone: "ink", depth: "floating", blur: "sm" }),
            "pop-in border-foreground/12 bg-background/88 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.65rem] sm:rounded-[2rem]",
          )}
        >
          <div className="border-foreground/[0.08] flex items-center gap-2 border-b p-3 sm:gap-3 sm:p-4">
            {mode === "tokens" && activeChain ? (
              <button
                type="button"
                onClick={() => {
                  setMode("networks");
                  setQuery("");
                }}
                className={cn(
                  glassSurfaceVariants({ tone: "clear", depth: "flat", blur: "none", interactive: true }),
                  "press flex h-12 shrink-0 items-center gap-2 rounded-2xl px-2.5 text-sm font-semibold sm:px-3",
                )}
                aria-label={`Change network. Current network ${activeChain.label}`}
              >
                <span className="[&>*]:size-7">{activeChain.icon}</span>
                <span className="hidden max-w-28 truncate sm:block">{activeChain.label}</span>
              </button>
            ) : null}

            <AnimatedSearchInput
              aria-label={mode === "tokens" ? "Search tokens" : "Search networks"}
              autoComplete="off"
              autoFocus
              blobTranslucent
              className="min-w-0 max-w-none flex-1"
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
              placeholder={mode === "tokens" ? searchPlaceholder : "Search networks…"}
              value={query}
            />

            <DialogClose className="press border-foreground/[0.07] bg-foreground/[0.05] text-foreground/45 hover:bg-foreground/10 hover:text-foreground flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

        {/* min-h floors the body so loading, a 1-item list, a short result, and the
            networks grid all settle at the SAME height — the loading skeleton below
            is kept under this floor, so opening / switching chains never resizes the
            panel (which read as a flicker / "reload"). */}
        <div className="min-h-[17rem] flex-1 overflow-y-auto px-3 sm:px-5">
          {mode === "networks" ? (
            filteredChains.length ? (
              <ul className="grid auto-rows-fr grid-cols-2 gap-2 py-4 sm:grid-cols-3">
                {filteredChains.map((chain) => {
                  const selected = chain.id === activeChainId;
                  return (
                    <li key={chain.id} className="h-full">
                      <button
                        type="button"
                        onClick={() => chooseChain(chain.id)}
                        className={cn(
                          "press flex h-full w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors sm:p-4",
                          selected
                            ? "border-emerald-300/30 bg-emerald-300/10"
                            : "border-foreground/[0.07] bg-foreground/[0.025] hover:border-foreground/15 hover:bg-foreground/[0.055]",
                        )}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center [&>*]:size-10">
                          {chain.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {chain.label}
                        </span>
                        {selected ? <Check className="size-4 shrink-0 text-emerald-300" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty label="No networks found" />
            )
          ) : loading ? (
            // Kept short (≤ the body min-height) so the panel doesn't shrink when
            // the real (usually 1-item) list arrives.
            <ul className="divide-foreground/[0.06] divide-y">
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="flex items-center gap-4 px-2 py-5">
                  <Skeleton className="size-12 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </li>
              ))}
            </ul>
          ) : filteredItems.length ? (
            <ul className="divide-foreground/[0.06] divide-y">
              {filteredItems.map((item) => {
                const selected = item.id === activeItemId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(item.id);
                        onOpenChange(false);
                        setQuery("");
                      }}
                      className="group press flex w-full items-center gap-4 px-2 py-4 text-left sm:py-5"
                    >
                      <span className="shrink-0 transition-transform duration-200 group-hover:scale-105 [&>*]:size-12">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-base font-semibold tracking-tight">
                          {item.label}
                        </span>
                        {item.sublabel ? (
                          <span className="text-foreground/38 mt-1 block truncate text-sm">
                            {item.sublabel}
                          </span>
                        ) : null}
                      </span>
                      {item.right ? (
                        <span className="bg-foreground/[0.05] text-foreground/45 shrink-0 rounded-full px-2.5 py-1 text-xs tabular-nums">
                          {item.right}
                        </span>
                      ) : null}
                      {selected ? (
                        <span className="flex size-7 items-center justify-center rounded-full bg-emerald-300/12 text-emerald-300">
                          <Check className="size-4" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty label="No tokens found" />
          )}
          </div>
        </div>

        {chains?.length ? (
          <div
            className={cn(
              glassSurfaceVariants({ tone: "clear", depth: "raised", blur: "sm" }),
              "pop-in border-foreground/12 bg-background/72 shrink-0 rounded-[1.5rem] p-3 sm:rounded-[1.75rem] sm:p-4",
            )}
          >
            <TooltipProvider delay={120}>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => {
                          setMode("networks");
                          setQuery("");
                        }}
                        className={cn(
                          "press flex size-[72px] shrink-0 items-center justify-center rounded-2xl border sm:size-20",
                          mode === "networks"
                            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
                            : "border-foreground/10 bg-foreground/[0.035] text-foreground/55 hover:bg-foreground/[0.07]",
                        )}
                        aria-label="Browse all networks"
                      >
                        <Globe2 className="size-9 sm:size-10" />
                      </button>
                    }
                  />
                  <TooltipContent>All networks</TooltipContent>
                </Tooltip>
                {chains.map((chain) => {
                  const selected = chain.id === activeChainId && mode === "tokens";
                  return (
                    <Tooltip key={chain.id}>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => chooseChain(chain.id)}
                            className={cn(
                              "press relative flex size-[72px] shrink-0 items-center justify-center rounded-2xl border sm:size-20",
                              selected
                                ? "border-emerald-500/40 bg-foreground/10 shadow-[0_0_30px_rgba(110,231,183,0.12)] dark:border-emerald-200/40"
                                : "border-foreground/10 bg-foreground/[0.035] hover:bg-foreground/[0.07]",
                            )}
                            aria-label={chain.label}
                          >
                            <span className="[&>*]:size-14 sm:[&>*]:size-16">{chain.icon}</span>
                            {selected ? (
                              <span className="absolute -bottom-1.5 size-1.5 rounded-full bg-emerald-200 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                            ) : null}
                          </button>
                        }
                      />
                      <TooltipContent>{chain.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        ) : null}

        {footer ? <div className="border-foreground/[0.07] border-t p-3">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="text-foreground/38 flex min-h-48 items-center justify-center text-sm">
      {label}
    </div>
  );
}
