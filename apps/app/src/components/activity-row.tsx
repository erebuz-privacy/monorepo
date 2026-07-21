import { ArrowRight, ArrowUpRight } from "lucide-react";

import { ChainGlyph, NetworkGlyph, SymbolGlyph, TokenGlyph } from "@/components/crypto-icon";
import { chainById, type Activity } from "@/lib/mock-data";
import { formatAmount, relativeTime } from "@/lib/format";
import { useApp } from "@/lib/store";

export function ActivityRow({ item }: { item: Activity }) {
  const { tokenById } = useApp();
  const live = item.live;

  // Real (TEE) transfers describe themselves via `item.live`; seed/mock ones
  // resolve through the mock chain/token maps.
  const fromToken = live ? undefined : tokenById(item.fromTokenId);
  const fromChain = live ? undefined : chainById(item.fromChainId);
  const toChain = live ? undefined : chainById(item.toChainId);

  const symbol = live?.sendSymbol ?? fromToken?.symbol;
  const fromLabel = live?.fromChainName ?? fromChain?.short;
  const toLabel = live?.toChainName ?? toChain?.short;

  return (
    <div className="flex items-center gap-3 py-3">
      {live ? (
        <SymbolGlyph symbol={live.sendSymbol} logoUrl={live.sendLogo} size={38} />
      ) : fromToken ? (
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
            {live ? (
              <ChainGlyph chainId={live.fromChainId} logoUrl={live.fromChainLogo} label={live.fromChainName} size={13} />
            ) : fromChain ? (
              <NetworkGlyph chain={fromChain} size={13} />
            ) : null}
            {fromLabel}
          </span>
          <ArrowRight className="size-3 shrink-0" />
          <span className="flex shrink-0 items-center gap-1">
            {live ? (
              <ChainGlyph chainId={live.toChainId} logoUrl={live.toChainLogo} label={live.toChainName} size={13} />
            ) : toChain ? (
              <NetworkGlyph chain={toChain} size={13} />
            ) : null}
            {toLabel}
          </span>
          <span className="text-muted-foreground/70 truncate">· {relativeTime(item.date)}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="text-sm font-medium tabular-nums">
          −{formatAmount(item.sendAmount, symbol)}
        </p>
        {item.status === "confirmed" ? (
          <span className="bg-brand/10 text-brand ring-brand/20 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset">
            Private
          </span>
        ) : item.status === "pending" ? (
          <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-amber-500/20 ring-inset dark:text-amber-400">
            Pending
          </span>
        ) : (
          <span className="bg-destructive/10 text-destructive ring-destructive/20 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset">
            Failed
          </span>
        )}
      </div>
    </div>
  );
}
