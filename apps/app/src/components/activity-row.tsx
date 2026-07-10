import { ArrowRight, ArrowUpRight } from "lucide-react";

import { NetworkGlyph, TokenGlyph } from "@/components/crypto-icon";
import { chainById, type Activity } from "@/lib/mock-data";
import { formatAmount, relativeTime } from "@/lib/format";
import { useApp } from "@/lib/store";

export function ActivityRow({ item }: { item: Activity }) {
  const { tokenById } = useApp();
  const fromChain = chainById(item.fromChainId);
  const fromToken = tokenById(item.fromTokenId);
  const toChain = chainById(item.toChainId);

  return (
    <div className="flex items-center gap-3 py-3">
      {fromToken ? (
        <TokenGlyph token={fromToken} size={38} />
      ) : (
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
          <ArrowUpRight className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.toLabel}</p>
        <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
          <span className="flex shrink-0 items-center gap-1">
            {fromChain ? <NetworkGlyph chain={fromChain} size={13} /> : null}
            {fromChain?.short}
          </span>
          <ArrowRight className="size-3 shrink-0" />
          <span className="flex shrink-0 items-center gap-1">
            {toChain ? <NetworkGlyph chain={toChain} size={13} /> : null}
            {toChain?.short}
          </span>
          <span className="text-muted-foreground/70 truncate">
            · {relativeTime(item.date)}
          </span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums">
          −{formatAmount(item.sendAmount, fromToken?.symbol)}
        </p>
        {item.status === "confirmed" ? (
          <p className="text-brand mt-0.5 text-xs font-medium">Private</p>
        ) : item.status === "pending" ? (
          <p className="mt-0.5 text-xs font-medium text-amber-500">Pending</p>
        ) : (
          <p className="text-destructive mt-0.5 text-xs font-medium">Failed</p>
        )}
      </div>
    </div>
  );
}
