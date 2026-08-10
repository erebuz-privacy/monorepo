"use client";

// Shareable, server-backed status page for a single private transfer (/tx/[id]).
// Anyone with the link can watch the route's live state — it fetches straight
// from the TEE by routeId (not the local activity store).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, Clock, Copy, Loader2, XCircle } from "lucide-react";

import { Skeleton } from "@erebuz/ui/components/skeleton";
import { cn } from "@erebuz/ui/lib/utils";

import { AssetGlyph } from "@/components/crypto-icon";
import { formatAmount, shortenAddress } from "@/lib/format";

const CARD = cn(
  "border border-border bg-card shadow-lg",
  "border-foreground/12 bg-background/88 rounded-3xl",
);
import { useChains } from "@/lib/tee-data";
import { fromSmallestUnit, tee, type RouteRecord } from "@/lib/tee";

const RAILGUN_PROGRESS: { status: string; label: string }[] = [
  { status: "BRIDGING_IN", label: "Bridging to the privacy hub" },
  { status: "RECEIVED_ON_HUB", label: "Shielding your funds" },
  { status: "SHIELDED", label: "Preparing the private payout" },
  { status: "UNSHIELD_SENT", label: "Sending to the recipient" },
  { status: "BRIDGING_OUT", label: "Finalizing on the destination chain" },
];
const ARC_PROGRESS: { status: string; label: string }[] = [
  { status: "BRIDGING_IN", label: "Circle CCTP burn → mint on Arc" },
  { status: "RECEIVED_ON_HUB", label: "Depositing into the Erebuz pool" },
  { status: "POOL_DEPOSITED", label: "Waiting for pool approval" },
  { status: "UNSHIELD_SENT", label: "Withdrawing privately" },
  { status: "BRIDGING_OUT", label: "Circle CCTP burn → destination mint" },
];
const TERMINAL = new Set(["COMPLETED", "FAILED"]);

export function TxView({ id }: { id: string }) {
  const [record, setRecord] = useState<RouteRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"addr" | "link" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  // Fallback anchor for the elapsed timer when the server createdAt is unusable.
  const [firstSeen] = useState(() => Date.now());
  const { chains } = useChains();

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setRecord(await tee.getRoute(id));
      setNotFound(false);
    } catch {
      setNotFound((prev) => prev || record === null);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [id, record]);

  useEffect(() => {
    // poll() only setStates after its async fetch resolves — an external-subscription
    // effect, not a synchronous render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void poll();
    const iv = setInterval(() => {
      if (record && TERMINAL.has(record.status)) return;
      void poll();
    }, 4000);
    return () => clearInterval(iv);
  }, [poll, record]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const copy = async (text: string, which: "addr" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (loading && !record && !notFound) {
    // Skeleton mirrors the real layout (header + summary card + status card) so the
    // page doesn't jump when data arrives.
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-12 pt-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className={cn(CARD, "p-5 sm:p-6")}>
          <Skeleton className="mb-4 h-6 w-40 rounded-lg" />
          <div className="flex items-center gap-4 py-3">
            <Skeleton className="size-[46px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-6 w-32 rounded" />
            </div>
          </div>
          <div className="border-foreground/[0.08] border-t" />
          <div className="flex items-center gap-4 py-3">
            <Skeleton className="size-[46px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-6 w-32 rounded" />
            </div>
          </div>
        </div>
        <div className={cn(CARD, "flex flex-col items-center gap-4 p-6")}>
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-5 w-48 rounded-lg" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="mt-2 h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (notFound || !record) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="bg-foreground/[0.05] flex size-14 items-center justify-center rounded-full">
          <XCircle className="text-foreground/40 size-7" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Transfer not found</h1>
          <p className="text-muted-foreground mt-1 text-sm">This link doesn&apos;t match any transfer.</p>
        </div>
        <Link href="/" className="bg-foreground text-background rounded-full px-5 py-2.5 text-sm font-semibold">
          Start a transfer
        </Link>
      </div>
    );
  }

  const chainFor = (cid?: number) => chains.find((c) => c.chainId === cid);
  const fromChain = chainFor(record.sourceChainId);
  const toChain = chainFor(record.destChainId);
  const fromName = fromChain?.displayName ?? `Chain ${record.sourceChainId}`;
  const toName = toChain?.displayName ?? `Chain ${record.destChainId}`;
  const sendAmt = fromSmallestUnit(record.amount, 6);
  const recvAmt = fromSmallestUnit(record.quotedOutputAmount, 6);
  const status = record.status;
  const isAwaiting = status === "AWAITING_DEPOSIT";
  const isDone = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const progress = record.privacyProvider === "arc" ? ARC_PROGRESS : RAILGUN_PROGRESS;
  const activeIdx = progress.findIndex((p) => p.status === status);
  const deposit = record.leg1DepositAddress ?? record.depositAddress ?? null;

  // Elapsed from the server createdAt — but a private route settles in minutes, so
  // anything negative or absurdly large means the server timestamp is bad (e.g. a
  // TEE timezone skew serializing createdAt hours off). In that case fall back to
  // counting from when this page first loaded the route, so we never show a wildly
  // wrong "hours elapsed". (The real fix is a correct server createdAt.)
  const createdMs = record.createdAt ? new Date(String(record.createdAt)).getTime() : NaN;
  const serverElapsed = Number.isFinite(createdMs) ? (now - createdMs) / 1000 : -1;
  const SANE_MAX = 2 * 3600; // 2h — no route legitimately runs this long
  const elapsed =
    serverElapsed >= 0 && serverElapsed <= SANE_MAX
      ? Math.floor(serverElapsed)
      : Math.floor((now - firstSeen) / 1000);
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-12 pt-6">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="text-foreground/60 hover:text-foreground flex items-center gap-1.5 text-sm font-medium">
          <ArrowLeft className="size-4" /> New transfer
        </Link>
        <button
          type="button"
          onClick={() => copy(typeof window !== "undefined" ? window.location.href : "", "link")}
          className="text-foreground/60 hover:text-foreground flex items-center gap-1.5 text-sm font-medium"
        >
          {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>

      {/* summary */}
      <div className={cn(CARD, "p-5 sm:p-6")}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-foreground text-lg font-semibold">Private transfer</h1>
          <span className="text-foreground/40 font-mono text-xs">{id.replace(/^route_/, "").slice(0, 8)}</span>
        </div>

        <div className="relative">
          <div className="flex items-center gap-4 py-3">
            <AssetGlyph symbol="USDC" chainId={record.sourceChainId} chainLabel={fromName} chainLogo={fromChain?.logoUrl} size={46} />
            <div className="min-w-0 flex-1">
              <p className="text-foreground/45 truncate text-xs font-medium">{fromName}</p>
              <p className="text-foreground mt-0.5 text-2xl font-semibold tabular-nums">{formatAmount(sendAmt, "USDC")}</p>
            </div>
          </div>
          <div className="border-foreground/[0.08] border-t" />
          <div className="flex items-center gap-4 py-3">
            <AssetGlyph symbol="USDC" chainId={record.destChainId} chainLabel={toName} chainLogo={toChain?.logoUrl} size={46} />
            <div className="min-w-0 flex-1">
              <p className="text-foreground/45 truncate text-xs font-medium">{toName}</p>
              <p className="text-foreground mt-0.5 text-2xl font-semibold tabular-nums">{formatAmount(recvAmt, "USDC")}</p>
              {record.userDestinationAddress ? (
                <p className="text-foreground/40 mt-0.5 truncate text-xs">to {shortenAddress(record.userDestinationAddress)}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* state */}
      {isAwaiting ? (
        <div className={cn(CARD, "flex flex-col items-center gap-4 p-5 text-center sm:p-6")}>
          <p className="text-sm">
            Send <span className="text-foreground font-semibold">{formatAmount(sendAmt, "USDC")}</span> on{" "}
            <span className="text-foreground font-semibold">{fromName}</span> to the address below.
          </p>
          {deposit ? (
            <>
              <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                <QRCodeSVG value={deposit} size={168} bgColor="#ffffff" fgColor="#0a0a0a" marginSize={0} level="M" />
              </div>
              <div className="border-foreground/[0.1] w-full rounded-2xl border p-4 text-left">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs">Deposit address · {fromName}</p>
                  <button type="button" onClick={() => copy(deposit, "addr")} className="text-brand flex items-center gap-1 text-xs font-medium">
                    {copied === "addr" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied === "addr" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 break-all text-sm">{deposit}</p>
              </div>
            </>
          ) : null}
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Watching for your deposit…
          </div>
          <p className="text-foreground/40 text-xs">Unfunded intents are cancelled after 5 minutes.</p>
        </div>
      ) : isDone ? (
        <div className={cn(CARD, "flex flex-col items-center gap-3 p-6 text-center")}>
          <div className="bg-brand/12 text-brand ring-brand/20 flex size-14 items-center justify-center rounded-full ring-1 ring-inset">
            <Check className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">Sent privately</h2>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground/90 font-semibold">{formatAmount(recvAmt, "USDC")}</span> delivered
            {record.userDestinationAddress ? <> to {shortenAddress(record.userDestinationAddress)}</> : null} on {toName}.
          </p>
          <p className="text-foreground/35 text-xs">The recipient was wiped from our records for privacy.</p>
        </div>
      ) : isFailed ? (
        <div className={cn(CARD, "flex flex-col items-center gap-3 p-6 text-center")}>
          <div className="bg-destructive/12 text-destructive flex size-14 items-center justify-center rounded-full">
            <XCircle className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">Transfer failed</h2>
          <p className="text-muted-foreground max-w-xs text-sm">
            {typeof record.error === "string" && record.error ? record.error : "Something went wrong routing this transfer."}
          </p>
        </div>
      ) : (
        <div className={cn(CARD, "p-5 sm:p-6")}>
          <div className="flex flex-col items-center text-center">
            <Loader2 className="text-brand size-9 animate-spin" />
            <p className="mt-3 text-base font-medium">{progress[activeIdx]?.label ?? "Routing privately"}</p>
            <div className="mt-3 flex justify-center">
              <span className="bg-foreground/[0.06] text-foreground/85 ring-foreground/[0.08] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ring-1 ring-inset">
                <Clock className="size-3.5" /> {mm}:{ss.toString().padStart(2, "0")}
                <span className="text-foreground/40 font-normal">elapsed</span>
              </span>
            </div>
          </div>
          <ol className="border-foreground/[0.1] divide-foreground/[0.08] mt-5 divide-y rounded-2xl border">
            {progress.map((p, i) => {
              const done = activeIdx > i;
              const active = activeIdx === i;
              return (
                <li key={p.status} className="flex items-center gap-3 p-3.5">
                  <span className={done ? "bg-brand/15 text-brand flex size-6 items-center justify-center rounded-full" : active ? "bg-primary/15 text-primary flex size-6 items-center justify-center rounded-full" : "bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full"}>
                    {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
                  </span>
                  <span className={active ? "text-sm font-medium" : done ? "text-sm" : "text-muted-foreground text-sm"}>{p.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
