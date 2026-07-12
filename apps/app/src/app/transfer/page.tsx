"use client";

// Live transfer screen: shows the Relay deposit address to fund, then polls the
// TEE for real route status through to completion. All data is live - the route
// runs server-side (Relay leg-1 -> Railgun shield/unshield -> Relay leg-2).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, BadgeCheck, Check, Copy, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import { cn } from "@erebuz/ui/lib/utils";

import { RemoteAssetGlyph, RemoteGlyph } from "@/components/crypto-icon";
import { FullScreenLoader } from "@/components/full-screen-loader";
import { Screen } from "@/components/screen";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import { useRouteDraft } from "@/lib/route-draft";
import { fromSmallestUnit, tee, type RouteRecord } from "@/lib/tee";

const TERMINAL = new Set(["COMPLETED", "FAILED"]);

// Ordered progress stages (AWAITING_DEPOSIT is handled separately as the funding step).
const PROGRESS: { status: string; label: string }[] = [
  { status: "BRIDGING_IN", label: "Bridging to the privacy hub" },
  { status: "RECEIVED_ON_HUB", label: "Shielding your funds" },
  { status: "SHIELDED", label: "Preparing the private payout" },
  { status: "UNSHIELD_SENT", label: "Sending to the recipient" },
  { status: "BRIDGING_OUT", label: "Finalizing on the destination chain" },
];

export default function TransferPage() {
  const router = useRouter();
  const { draft } = useRouteDraft();

  const [record, setRecord] = useState<RouteRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  const routeId = draft?.created?.routeId ?? null;

  // No created route (direct nav / reload) -> back to the quote screen.
  useEffect(() => {
    if (!draft?.created) router.replace("/");
  }, [draft, router]);

  const poll = useCallback(async () => {
    if (!routeId || inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await tee.getRoute(routeId);
      setRecord(r);
    } catch {
      // transient - keep the last known state and retry on the next tick
    } finally {
      inFlight.current = false;
    }
  }, [routeId]);

  useEffect(() => {
    if (!routeId) return;
    // poll() only setStates asynchronously (after the fetch resolves), so this
    // is an external-subscription effect, not a synchronous render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void poll();
    const id = setInterval(() => {
      if (record && TERMINAL.has(record.status)) return;
      void poll();
    }, 4000);
    return () => clearInterval(id);
  }, [routeId, poll, record]);

  if (!draft?.created) return <FullScreenLoader />;

  const { created, quote, fromChain, toChain, fromToken, toToken, recipientAddress } = draft;
  const status = record?.status ?? created.status ?? "AWAITING_DEPOSIT";
  const depositAddress = created.depositAddress;
  const sendNum = Number(draft.amount) || 0;
  const quotedOut = fromSmallestUnit(quote.quotedOutputAmount, quote.destDecimals);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const isAwaiting = status === "AWAITING_DEPOSIT";
  const isDone = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const activeIdx = PROGRESS.findIndex((p) => p.status === status);

  return (
    <Screen>
      <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
          {/* header */}
          <header className="border-border/60 flex items-center gap-3 border-b px-4 py-4">
            {isAwaiting ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="hover:bg-accent -ml-2 rounded-lg p-2"
                aria-label="Back"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : null}
            <h1 className="flex-1 text-base font-semibold">
              {isDone ? "Sent privately" : isFailed ? "Transfer failed" : isAwaiting ? "Deposit" : "Routing privately"}
            </h1>
          </header>

          {/* ---- awaiting deposit: show the address to fund ---- */}
          {isAwaiting ? (
            <div className="space-y-5 p-4">
              <div className="border-border bg-muted/30 space-y-1 rounded-2xl border p-4">
                <p className="text-muted-foreground text-sm">Deposit to complete</p>
                <p className="text-sm leading-relaxed">
                  Send{" "}
                  <span className="font-medium">{formatAmount(sendNum, fromToken.symbol)}</span> on{" "}
                  {fromChain.displayName} to the address below. We&apos;ll route it privately to{" "}
                  {shortenAddress(recipientAddress)}. You&apos;ll receive{" "}
                  <span className="font-medium">{formatAmount(quotedOut, quote.destSymbol)}</span>.
                </p>
              </div>

              <div className="flex justify-center">
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                  <QRCodeSVG value={depositAddress} size={168} bgColor="#ffffff" fgColor="#0a0a0a" marginSize={0} level="M" />
                </div>
              </div>

              <div className="border-border rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs">Deposit address · {fromChain.displayName}</p>
                  <button type="button" onClick={copyAddress} className="text-primary flex items-center gap-1 text-xs font-medium">
                    {copied ? (
                      <>
                        <Check className="size-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-2 break-all text-sm">{depositAddress}</p>
              </div>

              <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Watching for your deposit…
              </div>
            </div>
          ) : null}

          {/* ---- in progress ---- */}
          {!isAwaiting && !isDone && !isFailed ? (
            <div className="space-y-6 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative flex items-center justify-center">
                  <Loader2 className="text-primary size-10 animate-spin" />
                  <BadgeCheck className="text-primary absolute size-4" />
                </div>
                <p className="mt-6 text-base font-medium">
                  {PROGRESS[activeIdx]?.label ?? "Routing privately"}
                </p>
                <p className="text-muted-foreground mt-1 max-w-xs text-sm">
                  Keep this screen open. This can take a few minutes across the bridge legs.
                </p>
              </div>

              <ol className="border-border divide-border divide-y rounded-2xl border">
                {PROGRESS.map((p, i) => {
                  const done = activeIdx > i;
                  const active = activeIdx === i;
                  return (
                    <li key={p.status} className="flex items-center gap-3 p-3.5">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full",
                          done ? "bg-brand/15 text-brand" : active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
                      </span>
                      <span className={cn("text-sm", active ? "font-medium" : done ? "" : "text-muted-foreground")}>
                        {p.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          {/* ---- success ---- */}
          {isDone ? (
            <div className="animate-step-in flex flex-col items-center p-6">
              <div className="bg-brand/12 text-brand mt-3 flex size-14 items-center justify-center rounded-full">
                <Check className="size-7" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">Sent privately</h2>
              <p className="text-muted-foreground mt-1 font-mono text-xs">{created.routeId}</p>

              <div className="border-border mt-6 w-full overflow-hidden rounded-2xl border text-left text-sm">
                <div className="bg-muted/40 flex items-center gap-3 p-4">
                  <RemoteAssetGlyph
                    tokenLogo={toToken.logoUrl}
                    tokenLabel={quote.destSymbol}
                    chainLogo={toChain.logoUrl}
                    chainLabel={toChain.displayName}
                    size={38}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{shortenAddress(recipientAddress)}</p>
                    <p className="text-muted-foreground truncate text-xs">received on {toChain.displayName}</p>
                  </div>
                  <p className="shrink-0 text-right font-semibold tabular-nums">
                    +{formatAmount(quotedOut, quote.destSymbol)}
                  </p>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Fee</span>
                    <span>{quote.feeUsd != null ? formatUsd(quote.feeUsd) : "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Privacy</span>
                    <span className="text-brand font-medium">Confidential</span>
                  </div>
                </div>
              </div>

              <Button size="lg" className="mt-6 h-12 w-full text-base" onClick={() => router.push("/")}>
                Done
              </Button>
            </div>
          ) : null}

          {/* ---- failed ---- */}
          {isFailed ? (
            <div className="flex flex-col items-center p-6 text-center">
              <div className="bg-destructive/12 text-destructive mt-3 flex size-14 items-center justify-center rounded-full">
                <ShieldCheck className="size-7" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">Transfer failed</h2>
              <p className="text-muted-foreground mt-1 max-w-xs text-sm">
                {typeof record?.error === "string" && record.error
                  ? record.error
                  : "Something went wrong routing this transfer. Any deposited funds are refunded to the sender."}
              </p>
              <Button size="lg" variant="outline" className="mt-6 h-12 w-full text-base" onClick={() => router.push("/")}>
                Start over
              </Button>
            </div>
          ) : null}
        </div>

        {/* route footer */}
        {!isFailed ? (
          <div className="text-muted-foreground mt-4 flex items-center justify-center gap-2 text-xs">
            <RemoteGlyph src={fromChain.logoUrl} label={fromChain.displayName} size={14} />
            <span>{fromChain.displayName}</span>
            <span className="text-brand">→ Private →</span>
            <RemoteGlyph src={toChain.logoUrl} label={toChain.displayName} size={14} />
            <span>{toChain.displayName}</span>
          </div>
        ) : null}
    </Screen>
  );
}
