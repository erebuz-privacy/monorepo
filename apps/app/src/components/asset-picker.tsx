"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";

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

  // First 6 chains shown as compact tiles; overflow shown in a 3×3 grid "more" tile.
  // The globe tile opens the full networks browse view.
  const displayChains = useMemo(() => (chains ?? []).slice(0, 6), [chains]);
  const overflowChains = useMemo(() => (chains ?? []).slice(6, 9), [chains]);

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
        className="text-foreground !top-1/2 !left-1/2 flex max-h-[min(82dvh,760px)] w-[calc(100vw-1rem)] !max-w-[640px] !-translate-x-1/2 !-translate-y-1/2 flex-col gap-3 overflow-visible border-0 bg-transparent p-0 opacity-100 shadow-none ring-0 transition-opacity duration-200 ease-out [animation:none!important] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:w-[min(92vw,640px)]"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {description ?? "Choose a network and asset"}
        </DialogDescription>

        <div
          className={cn(
            glassSurfaceVariants({ tone: "ink", depth: "floating", blur: "sm" }),
            "pop-in border-foreground/12 bg-background/88 flex flex-col overflow-hidden rounded-[1.65rem] sm:rounded-[2rem]",
          )}
        >
          <div className="border-foreground/[0.08] flex items-center gap-2 border-b p-3 sm:gap-3 sm:p-4">
            {mode === "networks" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("tokens");
                  setQuery("");
                }}
                className="press border-foreground/[0.07] bg-foreground/[0.05] text-foreground/55 hover:bg-foreground/10 hover:text-foreground flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors"
                aria-label="Back to tokens"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : mode === "tokens" && activeChain ? (
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
                <span className="inline-flex size-7 overflow-hidden rounded-[6px] [&>*]:w-full [&>*]:h-full">{activeChain.icon}</span>
                <span className="text-nowrap">{activeChain.label}</span>
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

        {/* FIXED body height (not content-driven) so the panel NEVER resizes:
            loading, a 1-item list, a long list, and the networks tile grid all live
            in this same scrollable box. This is what kills the open/select "expand
            then shrink" flicker — content swaps in place, the panel size is constant. */}
        <div className="h-[20rem] overflow-y-auto px-3 sm:px-5">
          {mode === "networks" ? (
            filteredChains.length ? (
              <ul className="grid grid-cols-3 gap-x-3 gap-y-6 py-6 sm:grid-cols-5">
                {filteredChains.map((chain) => {
                  const selected = chain.id === activeChainId;
                  return (
                    <li key={chain.id} className="h-full">
                      <button
                        type="button"
                        onClick={() => chooseChain(chain.id)}
                        className="group press flex w-full flex-col items-center gap-2 text-center"
                        aria-label={chain.label}
                      >
                        <span
                          className={cn(
                            "relative aspect-square w-full max-w-20 overflow-hidden rounded-[1.15rem] ring-1 ring-inset transition-all duration-200 group-hover:scale-105 sm:rounded-[1.35rem]",
                            selected
                              ? "ring-2 ring-emerald-400/70 shadow-[0_0_30px_rgba(110,231,183,0.18)]"
                              : "ring-foreground/10 group-hover:ring-foreground/20",
                          )}
                        >
                          <span className="bg-foreground/[0.04] flex size-full items-center justify-center">
                            <span className="inline-flex size-9 items-center justify-center overflow-hidden rounded-[0.7rem] sm:size-10 [&>*]:size-full [&>*]:object-cover">
                              {chain.icon}
                            </span>
                          </span>

                        </span>
                        <span
                          className={cn(
                            "block w-full text-sm font-semibold leading-tight text-balance",
                            selected ? "text-emerald-200" : "text-foreground/85",
                          )}
                        >
                          {chain.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty label="No networks found" />
            )
          ) : loading ? (
            <ul className="divide-foreground/[0.06] divide-y">
              {Array.from({ length: 4 }).map((_, index) => (
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
                      className="group press flex w-full items-center gap-4 px-2 py-5 text-left sm:py-6"
                    >
                      <span className="shrink-0 inline-flex size-12 overflow-hidden transition-transform duration-200 group-hover:scale-105 [&>*]:w-full [&>*]:h-full">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-xl font-semibold tracking-tight">
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
            <div className="no-scrollbar flex items-start gap-2.5 overflow-x-auto sm:gap-3">
              <button
                type="button"
                className="press relative flex size-14 shrink-0 items-center justify-center sm:size-16"
              >
                <span
                  className={cn(
                    "flex size-full items-center justify-center rounded-[1.15rem] ring-1 ring-inset transition-colors sm:rounded-[1.35rem]",
                    mode === "networks"
                      ? "bg-emerald-300/12 text-emerald-200 ring-emerald-300/40"
                      : "bg-foreground/[0.05] text-foreground/55 ring-foreground/10 hover:bg-foreground/[0.08]",
                  )}
                >
                  <Image src="/globe.svg" alt="" width={28} height={28} className="size-7 invert dark:invert-0" />
                </span>
              </button>

              {displayChains.map((chain) => {
                const selected = chain.id === activeChainId && mode === "tokens";
                return (
                  <button
                    type="button"
                    key={chain.id}
                    onClick={() => chooseChain(chain.id)}
                    className="press relative flex size-14 shrink-0 items-center justify-center sm:size-16"
                    aria-label={chain.label}
                    title={chain.label}
                  >
                    <span
                      className={cn(
                        "size-full overflow-hidden rounded-[1.15rem] ring-1 ring-inset transition-shadow sm:rounded-[1.35rem]",
                        selected
                          ? "ring-2 ring-emerald-400/70 shadow-[0_0_30px_rgba(110,231,183,0.18)]"
                          : "ring-foreground/10",
                      )}
                    >
                      <span className="bg-foreground/[0.04] flex size-full items-center justify-center">
                        <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-[0.65rem] sm:size-9 [&>*]:size-full [&>*]:object-cover">
                          {chain.icon}
                        </span>
                      </span>
                    </span>
                    {selected ? (
                      <span className="absolute -bottom-2 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                    ) : null}
                  </button>
                );
              })}

              {overflowChains.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("networks");
                    setQuery("");
                  }}
                  className="press relative flex size-14 shrink-0 items-center justify-center sm:size-16"
                  aria-label="More networks"
                  title="More networks"
                >
                  <span className="flex size-full items-center justify-center rounded-[1.15rem] bg-foreground/[0.05] ring-1 ring-inset ring-foreground/[0.08] transition-colors hover:bg-foreground/[0.09] sm:rounded-[1.35rem]">
                    {/* Grid sizes to the count: ≤4 overflow chains use a 2×2 so the
                        few logos fill the tile instead of hiding in a sparse 3×3. */}
                    <span
                      className={cn(
                        "grid size-full",
                        overflowChains.length <= 4
                          ? "grid-cols-2 grid-rows-2 gap-1 p-2 sm:gap-1.5 sm:p-2.5"
                          : "grid-cols-3 grid-rows-3 gap-[3px] p-1.5 sm:gap-1 sm:p-2",
                      )}
                    >
                      {overflowChains.map((c) => (
                        <span
                          key={c.id}
                          className="flex items-center justify-center overflow-hidden rounded-[5px] bg-foreground/[0.06] [&>*]:size-full [&>*]:object-cover sm:rounded-md"
                        >
                          {c.icon}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              ) : null}

            </div>
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
