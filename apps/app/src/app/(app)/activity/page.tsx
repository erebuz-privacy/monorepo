"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { GradientHeading } from "@erebuz/ui/components/gradient-heading";
import { Separator } from "@erebuz/ui/components/separator";

import { ActivityRow } from "@/components/activity-row";
import { ChainGlyph, RouteTrail } from "@/components/crypto-icon";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { formatAmount, formatUsd } from "@/lib/format";
import { chainById, type Activity } from "@/lib/mock-data";
import { useApp } from "@/lib/store";

const PAGE_SIZE = 8;

// ── Activity section commented out ──────────────────────────────────
// Everything below is kept for reference but not rendered.
/* eslint-disable */
export default function ActivityPage() {
  // const { activity, tokenById } = useApp();
  // const [selected, setSelected] = useState<Activity | null>(null);
  // const [page, setPage] = useState(0);
  //
  // const pageCount = Math.max(1, Math.ceil(activity.length / PAGE_SIZE));
  // const cur = Math.min(page, pageCount - 1);
  // const pageItems = activity.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  //
  // const live = selected?.live;
  // const fromToken = selected && !live ? tokenById(selected.fromTokenId) : null;
  // const toToken = selected && !live ? tokenById(selected.toTokenId) : null;
  // const fromChain = selected && !live ? chainById(selected.fromChainId) : null;
  // const toChain = selected && !live ? chainById(selected.toChainId) : null;
  //
  // return (
  //   <div className="page-enter mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
  //     <header className="mb-6">
  //       <GradientHeading as="h1" size="md" weight="semi">
  //         Activity
  //       </GradientHeading>
  //       <p className="text-muted-foreground mt-1 text-sm">
  //         Your private transfers
  //       </p>
  //     </header>
  //
  //     {activity.length === 0 ? (
  //       <div className="border-border rounded-2xl border py-16 text-center">
  //         <p className="text-muted-foreground text-sm">No transfers yet.</p>
  //       </div>
  //     ) : (
  //       <>
  //         <div className="border-border divide-border overflow-hidden rounded-2xl border divide-y shadow-sm shadow-black/[0.03] dark:shadow-xl dark:shadow-black/20">
  //           {pageItems.map((item, i) => (
  //             <button
  //               key={item.id}
  //               type="button"
  //               onClick={() => setSelected(item)}
  //               style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
  //               className="row-in press hover:bg-accent/40 block w-full cursor-pointer px-4 text-left"
  //             >
  //               <ActivityRow item={item} />
  //             </button>
  //           ))}
  //         </div>
  //
  //         {pageCount > 1 ? (
  //           <div className="mt-4 flex items-center justify-between">
  //             <button
  //               type="button"
  //               disabled={cur === 0}
  //               onClick={() => setPage(cur - 1)}
  //               className="press border-border hover:bg-accent inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium disabled:pointer-events-none disabled:opacity-40"
  //             >
  //               <ChevronLeft className="size-3.5" />
  //               Prev
  //             </button>
  //             <span className="text-muted-foreground text-xs tabular-nums">
  //               Page {cur + 1} of {pageCount}
  //             </span>
  //             <button
  //               type="button"
  //               disabled={cur >= pageCount - 1}
  //               onClick={() => setPage(cur + 1)}
  //               className="press border-border hover:bg-accent inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium disabled:pointer-events-none disabled:opacity-40"
  //             >
  //               Next
  //               <ChevronRight className="size-3.5" />
  //             </button>
  //           </div>
  //         ) : null}
  //       </>
  //     )}
  //
  //     <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
  //       <DialogContent className="sm:max-w-md">
  //         <DialogHeader>
  //           <DialogTitle>Transfer details</DialogTitle>
  //         </DialogHeader>
  //         {selected ? (
  //           <div className="space-y-3 text-sm">
  //             <Row label="To">{selected.toLabel}</Row>
  //             <Row label="You sent">
  //               <span className="tabular-nums">
  //                 {formatAmount(selected.sendAmount, live?.sendSymbol ?? fromToken?.symbol)} ·{" "}
  //                 {live?.fromChainName ?? fromChain?.name}
  //               </span>
  //             </Row>
  //             <Row label="They received">
  //               <span className="tabular-nums">
  //                 ≈ {formatAmount(selected.receiveAmount, live?.recvSymbol ?? toToken?.symbol)} ·{" "}
  //                 {live?.toChainName ?? toChain?.name}
  //               </span>
  //             </Row>
  //             <Row label="Fee">
  //               <span className="text-muted-foreground">
  //                 {formatUsd(selected.feeUsd)}
  //               </span>
  //             </Row>
  //             <Row label="Privacy">
  //               <span className="text-brand font-medium">Confidential</span>
  //             </Row>
  //             <Row label="Reference">
  //               <span className="text-muted-foreground text-xs tabular-nums">
  //                 {live?.routeId ?? selected.id}
  //               </span>
  //             </Row>
  //
  //             <Separator />
  //             <p className="text-muted-foreground text-xs">Route</p>
  //             {live ? (
  //               <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
  //                 <ChainGlyph chainId={live.fromChainId} logoUrl={live.fromChainLogo} label={live.fromChainName} size={16} />
  //                 <span className="text-foreground">{live.fromChainName}</span>
  //                 <span className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full px-1.5 py-0.5">
  //                   <Lock className="size-3" />
  //                   Private
  //                 </span>
  //                 <ChainGlyph chainId={live.toChainId} logoUrl={live.toChainLogo} label={live.toChainName} size={16} />
  //                 <span className="text-foreground">{live.toChainName}</span>
  //               </div>
  //             ) : (
  //               <RouteTrail route={selected.route} />
  //             )}
  //           </div>
  //         ) : null}
  //       </DialogContent>
  //     </Dialog>
  //   </div>
  // );

  return null;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
