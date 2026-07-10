"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Separator } from "@erebuz/ui/components/separator";

import { ActivityRow } from "@/components/activity-row";
import { RouteTrail } from "@/components/crypto-icon";
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
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your private transfers
        </p>
      </header>

      {activity.length === 0 ? (
        <div className="border-border rounded-2xl border py-16 text-center">
          <p className="text-muted-foreground text-sm">No transfers yet.</p>
        </div>
      ) : (
        <div className="border-border divide-border overflow-hidden rounded-2xl border divide-y">
          {activity.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="hover:bg-accent/40 block w-full px-4 text-left transition-colors"
            >
              <ActivityRow item={item} />
            </button>
          ))}
        </div>
      )}

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
                <span className="text-brand font-medium">Confidential</span>
              </Row>
              <Row label="Reference">
                <span className="text-muted-foreground text-xs">
                  {selected.id}
                </span>
              </Row>

              <Separator />
              <p className="text-muted-foreground text-xs">Route</p>
              <RouteTrail route={selected.route} />
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
