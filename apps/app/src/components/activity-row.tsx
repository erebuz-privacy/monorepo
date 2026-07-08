import { ArrowUpRight } from "lucide-react";

import { Badge } from "@erebuz/ui/components/badge";

import { chainById, type Activity } from "@/lib/mock-data";
import { formatAmount, relativeTime } from "@/lib/format";
import { useApp } from "@/lib/store";

export function ActivityRow({ item }: { item: Activity }) {
  const { tokenById } = useApp();
  const fromChain = chainById(item.fromChainId);
  const fromToken = tokenById(item.fromTokenId);
  const toChain = chainById(item.toChainId);
  const toToken = tokenById(item.toTokenId);

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
        <ArrowUpRight className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.toLabel}</p>
        <p className="text-muted-foreground truncate text-xs">
          {fromChain?.name} {fromToken?.symbol} → {toChain?.name}{" "}
          {toToken?.symbol} · {relativeTime(item.date)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums">
          −{formatAmount(item.sendAmount, fromToken?.symbol)}
        </p>
        {item.status === "confirmed" ? (
          <Badge variant="success" className="mt-0.5">
            private
          </Badge>
        ) : item.status === "pending" ? (
          <Badge variant="warning" className="mt-0.5">
            pending
          </Badge>
        ) : (
          <Badge variant="outline" className="mt-0.5">
            failed
          </Badge>
        )}
      </div>
    </div>
  );
}
