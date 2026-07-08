"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { Badge } from "@erebuz/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Separator } from "@erebuz/ui/components/separator";

import { ActivityRow } from "@/components/activity-row";
import { formatAmount, formatUsd } from "@/lib/format";
import { chainById, type Activity } from "@/lib/mock-data";
import { useApp } from "@/lib/store";

export default function ActivityPage() {
  const { activity, tokenById } = useApp();
  const [selected, setSelected] = useState<Activity | null>(null);

  const fromToken = selected ? tokenById(selected.fromTokenId) : null;
  const toToken = selected ? tokenById(selected.toTokenId) : null;
  const fromChain = selected ? chainById(selected.fromChainId) : null;
  const toChain = selected ? chainById(selected.toChainId) : null;

  return (
    <div>
      <header className="px-5 pb-2 pt-6">
        <h1 className="text-xl font-semibold">Activity</h1>
      </header>

      <div className="divide-border divide-y px-5">
        {activity.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No transfers yet.
          </p>
        ) : (
          activity.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="hover:bg-accent/40 -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 text-left transition-colors"
            >
              <ActivityRow item={item} />
            </button>
          ))
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer details</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 text-sm">
              <Row label="To">{selected.toLabel}</Row>
              <Row label="You sent">
                <span className="tabular-nums">
                  {formatAmount(selected.sendAmount, fromToken?.symbol)} ·{" "}
                  {fromChain?.name}
                </span>
              </Row>
              <Row label="They received">
                <span className="tabular-nums">
                  ≈ {formatAmount(selected.receiveAmount, toToken?.symbol)} ·{" "}
                  {toChain?.name}
                </span>
              </Row>
              <Row label="Fee">
                <span className="text-muted-foreground">
                  {formatUsd(selected.feeUsd)}
                </span>
              </Row>
              <Row label="Privacy">
                <Badge variant="success">Confidential</Badge>
              </Row>
              <Row label="Reference">
                <span className="text-muted-foreground text-xs">
                  {selected.id}
                </span>
              </Row>

              <Separator />
              <p className="text-muted-foreground text-xs">Route</p>
              <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                {selected.route.map((hop, i) => (
                  <span key={hop} className="flex items-center gap-1.5">
                    <span className="bg-muted rounded px-1.5 py-0.5">{hop}</span>
                    {i < selected.route.length - 1 ? (
                      <ArrowRight className="size-3" />
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
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
