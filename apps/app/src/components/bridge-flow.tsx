"use client";

// The entire bridge experience on ONE page as a Dynamic-Island-style morph:
// a single container that springs its shape/size and crossfades its contents as
// the user acts. Views:
//   form     — enter amount, pick assets + recipient, live quote
//   route    — inspect the discovered route, fees, and transfer time
//   status   — a specific transfer's live state (funding → routing → done/failed)
//   pending  — the list of in-flight transfers (opened from the badge)
//
// A transfer, once created, is recorded locally (see store.upsertActivity) and
// its status is polled app-wide by <TxTracker>; this screen just reads the
// record. So the badge count, the pending list, and each status view all reflect
// the same persisted, self-updating source of truth.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { glassSurfaceVariants } from "@erebuz/ui/components/glass-surface";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  Lock,
  ScanQrCode,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import { GradientHeading } from "@erebuz/ui/components/gradient-heading";
import { Input } from "@erebuz/ui/components/input";
import { Skeleton } from "@erebuz/ui/components/skeleton";
import { TextureButton } from "@erebuz/ui/components/texture-button";
import { cn } from "@erebuz/ui/lib/utils";

import { AssetPicker, type ChainChip, type PickerItem } from "@/components/asset-picker";
import { ErrorNote } from "@/components/error-note";
import { QrScanDialog, normalizeScannedAddress } from "@/components/qr-scan-dialog";
import {
  AssetGlyph,
  ChainGlyph,
  GradientAvatar,
  PrivateRouteTrail,
  SymbolGlyph,
} from "@/components/crypto-icon";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Activity } from "@/lib/mock-data";
import { useChains, useTokens } from "@/lib/tee-data";
import { fromSmallestUnit, tee, type CreatedRoute, type TeeQuote, type TeeToken } from "@/lib/tee";

export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE === "true";
const DEFAULT_FROM_CHAIN = TEST_MODE ? 84532 : 8453; // Base Sepolia : Base
const DEFAULT_TO_CHAIN = TEST_MODE ? 11155111 : 1; // Ethereum Sepolia : Ethereum
const DEFAULT_SYMBOL = "USDC";
const REFRESH_MS = 20_000;

const PROGRESS: { status: string; label: string }[] = [
  { status: "BRIDGING_IN", label: "Bridging to the privacy hub" },
  { status: "RECEIVED_ON_HUB", label: "Shielding your funds" },
  { status: "SHIELDED", label: "Preparing the private payout" },
  { status: "UNSHIELD_SENT", label: "Sending to the recipient" },
  { status: "BRIDGING_OUT", label: "Finalizing on the destination chain" },
];

function formatEta(seconds: number): string {
  if (seconds < 120) return `~${Math.max(1, Math.round(seconds))} sec`;
  return `~${Math.max(1, Math.round(seconds / 60))} min`;
}

function stageLabel(stage?: string): string {
  if (!stage || stage === "AWAITING_DEPOSIT") return "Awaiting deposit";
  if (stage === "COMPLETED") return "Completed";
  if (stage === "FAILED") return "Failed";
  return PROGRESS.find((p) => p.status === stage)?.label ?? "Routing privately";
}

/**
 * Live mm:ss elapsed timer + a reassurance notice once the route runs past its
 * quoted estimate. Mounts when the routing view appears (deposit detected), so
 * it starts from zero then; self-contained so only it re-renders each tick.
 */
function RoutingStatus({ etaSeconds, startedAt }: { etaSeconds?: number; startedAt?: number }) {
  // Elapsed is anchored to the route's creation time (server-authoritative when
  // passed), so it stays correct across refresh / reopen instead of restarting.
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = startedAt && startedAt > 0 ? startedAt : mountedAt;
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  // A minute past the quoted estimate (min 2.5m) counts as "longer than usual".
  const slow = seconds > Math.max(150, (etaSeconds ?? 120) + 60);
  return (
    <>
      <div className="mt-3 flex justify-center">
        <span className="bg-foreground/[0.06] text-foreground/85 ring-foreground/[0.08] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ring-1 ring-inset">
          <Clock className="size-3.5" />
          {mm}:{ss.toString().padStart(2, "0")}
          <span className="text-foreground/40 font-normal">elapsed</span>
        </span>
      </div>
      {slow ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3 py-2.5 text-left text-sm text-amber-600 ring-1 ring-amber-500/20 ring-inset dark:text-amber-400">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>
            Taking longer than usual. Hang tight, your funds are safe.
          </span>
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 max-w-xs text-sm">
          This can take a few minutes. It&apos;ll keep updating in Activity.
        </p>
      )}
    </>
  );
}

type View = "form" | "route" | "pending";

/** Large route row inspired by Superbridge's scannable chain/token hierarchy. */
function RouteAssetRow({
  eyebrow,
  tokenLogo,
  symbol,
  chainId,
  chainLogo,
  chainName,
  onClick,
  loading,
}: {
  eyebrow: string;
  tokenLogo?: string | null;
  symbol?: string;
  chainId?: number;
  chainLogo?: string | null;
  chainName?: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  if (loading && !symbol) {
    return (
      <div className="flex min-h-24 items-center gap-4 px-5 py-3.5 sm:min-h-28 sm:py-5">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-24 w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left [-webkit-tap-highlight-color:transparent] focus-visible:outline-none sm:min-h-28 sm:py-5"
    >
      {symbol ? (
        <AssetGlyph
          symbol={symbol}
          tokenLogo={tokenLogo}
          chainId={chainId}
          chainLabel={chainName ?? ""}
          chainLogo={chainLogo}
          size={56}
        />
      ) : (
        <span className="border-foreground/20 bg-foreground/[0.04] flex size-14 items-center justify-center rounded-full border border-dashed">
          <ChevronDown className="text-foreground/45 size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="text-foreground/55 mb-1 flex items-center gap-1.5 truncate text-xs font-medium">
          <span>{eyebrow}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{chainName ?? "Choose network"}</span>
        </span>
        <span className="text-foreground block truncate text-xl font-semibold tracking-tight sm:text-2xl">
          {symbol ?? "Select asset"}
        </span>
      </span>
      {symbol ? (
        <span className="bg-foreground/[0.06] text-foreground/60 rounded-full px-3 py-1.5 text-sm font-semibold">
          {symbol}
        </span>
      ) : null}
      <ChevronDown className="text-foreground/45 group-hover:text-foreground/70 size-4 shrink-0 transition-colors" />
    </button>
  );
}

export function BridgeFlow() {
  const { activity, upsertActivity } = useApp();
  const prefersReduced = useReducedMotion();
  const reduce = !!prefersReduced;

  // ---- flow state ----
  const [view, setView] = useState<View>("form");
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ---- quote state (form) ----
  const { chains, loading: chainsLoading, error: chainsError, retry: retryChains } = useChains();
  const [fromChainSel, setFromChainId] = useState<number | null>(null);
  const [toChainSel, setToChainId] = useState<number | null>(null);
  const [fromTokenSel, setFromToken] = useState<TeeToken | null>(null);
  const [toTokenSel, setToToken] = useState<TeeToken | null>(null);
  const [amount, setAmount] = useState("");
  const [recipientAddr, setRecipientAddr] = useState("");
  const [routeNeedsRecipient, setRouteNeedsRecipient] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);

  const [quote, setQuote] = useState<TeeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const fromChainId =
    fromChainSel ??
    (chains.length
      ? chains.some((c) => c.chainId === DEFAULT_FROM_CHAIN)
        ? DEFAULT_FROM_CHAIN
        : chains[0].chainId
      : null);
  const toChainId =
    toChainSel ??
    (chains.length
      ? chains.find((c) => c.chainId === DEFAULT_TO_CHAIN)?.chainId ??
        chains.find((c) => c.chainId !== fromChainId)?.chainId ??
        chains[0].chainId
      : null);

  const { tokens: fromTokens, loading: fromTokensLoading } = useTokens(fromChainId);
  const { tokens: toTokens, loading: toTokensLoading } = useTokens(toChainId);

  const fromToken = useMemo<TeeToken | null>(() => {
    if (fromTokenSel && fromTokens.some((t) => t.address === fromTokenSel.address)) return fromTokenSel;
    return fromTokens.find((t) => t.symbol.toUpperCase() === DEFAULT_SYMBOL) ?? fromTokens[0] ?? null;
  }, [fromTokenSel, fromTokens]);

  const toToken = useMemo<TeeToken | null>(() => {
    if (toTokenSel && toTokens.some((t) => t.address === toTokenSel.address)) return toTokenSel;
    const mirror =
      fromToken && toTokens.find((t) => t.symbol.toUpperCase() === fromToken.symbol.toUpperCase());
    return mirror ?? toTokens.find((t) => t.symbol.toUpperCase() === DEFAULT_SYMBOL) ?? toTokens[0] ?? null;
  }, [toTokenSel, toTokens, fromToken]);

  const fromChain = useMemo(() => chains.find((c) => c.chainId === fromChainId) ?? null, [chains, fromChainId]);
  const toChain = useMemo(() => chains.find((c) => c.chainId === toChainId) ?? null, [chains, toChainId]);

  const recipient = useMemo(() => {
    const addr = recipientAddr.trim();
    if (!addr) return null;
    return { address: addr, label: shortenAddress(addr), sublabel: "Wallet address", icon: <GradientAvatar seed={addr} /> };
  }, [recipientAddr]);

  const amountNum = Number(amount) || 0;
  const canQuote = Boolean(fromToken && toToken && fromChainId != null && toChainId != null && amountNum > 0);

  const runQuote = useCallback(
    (silent: boolean, i: { sourceChainId: number; destChainId: number; amount: string; tokenSymbol: string; destTokenSymbol: string }) => {
      const id = ++reqIdRef.current;
      // Silent (20s) refreshes update the value in place — no loading UI, so the
      // dialog never reshapes while it's just re-pricing.
      if (!silent) setQuoteLoading(true);
      setQuoteError(null);
      tee
        .quote(i)
        .then((q) => {
          if (id !== reqIdRef.current) return;
          setQuote(q);
          setQuoteLoading(false);
        })
        .catch((e: Error) => {
          if (id !== reqIdRef.current) return;
          if (!silent) {
            setQuote(null);
            setQuoteError(e.message);
          }
          setQuoteLoading(false);
        });
    },
    []
  );

  // Only quote while the form is active (no point polling behind route details,
  // status, or activity views).
  const quoting = view === "form" && !activeRouteId;
  useEffect(() => {
    const id = ++reqIdRef.current;
    if (!quoting || !canQuote || !fromToken || !toToken || fromChainId == null || toChainId == null) {
      queueMicrotask(() => {
        if (id !== reqIdRef.current) return;
        setQuoteLoading(false);
        if (!canQuote) setQuote(null);
      });
      return;
    }
    const i = { sourceChainId: fromChainId, destChainId: toChainId, amount, tokenSymbol: fromToken.symbol, destTokenSymbol: toToken.symbol };
    const t = setTimeout(() => runQuote(false, i), 450);
    const iv = setInterval(() => runQuote(true, i), REFRESH_MS);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [quoting, canQuote, fromToken, toToken, fromChainId, toChainId, amount, runQuote]);

  const quotedOut = quote ? fromSmallestUnit(quote.quotedOutputAmount, quote.destDecimals) : 0;
  const sendUsd = quote?.amountInUsd ?? null;
  const receiveUsd = quote?.quotedOutputUsd ?? null;
  // The private hop is implemented by Railgun. Keep the product-facing route
  // name stable even if the backend returns a chain-qualified pool label.
  const pool = "Railgun";

  const chainChips: ChainChip[] = useMemo(
    () => chains.map((c) => ({ id: String(c.chainId), label: c.displayName, icon: <ChainGlyph chainId={c.chainId} label={c.displayName} logoUrl={c.logoUrl} size={24} /> })),
    [chains]
  );
  const toPickerItems = (tokens: TeeToken[]): PickerItem[] =>
    tokens.map((t) => ({ id: t.address, label: t.symbol, sublabel: t.name, icon: <SymbolGlyph symbol={t.symbol} logoUrl={t.logoUrl} size={32} /> }));
  const fromTokenItems = useMemo(() => toPickerItems(fromTokens), [fromTokens]);
  const toTokenItems = useMemo(() => toPickerItems(toTokens), [toTokens]);

  const ready = Boolean(quote && !quoteError && recipient && canQuote);

  const retryQuote = () => {
    if (!canQuote || !fromToken || !toToken || fromChainId == null || toChainId == null) return;
    runQuote(false, { sourceChainId: fromChainId, destChainId: toChainId, amount, tokenSymbol: fromToken.symbol, destTokenSymbol: toToken.symbol });
  };

  const resetForm = () => {
    setAmount("");
    setRecipientAddr("");
    setQuote(null);
    setQuoteError(null);
    setCreateError(null);
    setCreating(false);
    setRouteNeedsRecipient(false);
  };

  // ---- create the route (managed path) ----
  const startManaged = async () => {
    if (!quote || !fromChain || !fromToken || !toChain || !toToken || !recipient) return;
    setCreateError(null);
    setCreating(true);
    try {
      const created: CreatedRoute = await tee.createRoute({
        sourceChainId: fromChain.chainId,
        destChainId: toChain.chainId,
        amount,
        tokenSymbol: fromToken.symbol,
        destTokenSymbol: toToken.symbol,
        userDestinationAddress: recipient.address,
      });
      const entry: Activity = {
        id: created.routeId,
        date: new Date().toISOString(),
        fromChainId: "",
        fromTokenId: "",
        toChainId: "",
        toTokenId: "",
        toLabel: recipient.label,
        sendAmount: amountNum,
        receiveAmount: fromSmallestUnit(quote.quotedOutputAmount, quote.destDecimals),
        feeUsd: quote.feeUsd ?? 0,
        status: "pending",
        route: [fromChain.displayName, "Railgun", toChain.displayName],
        live: {
          fromChainId: fromChain.chainId,
          fromChainName: fromChain.displayName,
          fromChainLogo: fromChain.logoUrl,
          toChainId: toChain.chainId,
          toChainName: toChain.displayName,
          toChainLogo: toChain.logoUrl,
          sendSymbol: fromToken.symbol,
          sendLogo: fromToken.logoUrl,
          recvSymbol: quote.destSymbol,
          routeId: created.routeId,
          stage: created.status ?? "AWAITING_DEPOSIT",
          depositAddress: created.depositAddress,
          etaSeconds: quote.etaSeconds,
        },
      };
      upsertActivity(entry);
      setCreating(false);
      setView("form"); // so leaving the status view returns to a fresh form
      setActiveRouteId(created.routeId);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn't start the transfer.");
      setCreating(false);
    }
  };

  const copyAddress = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // ---- active transfer (status view) ----
  const activeRecord = useMemo(
    () => (activeRouteId ? activity.find((a) => a.live?.routeId === activeRouteId) ?? null : null),
    [activity, activeRouteId]
  );
  const stage = activeRecord?.live?.stage ?? "AWAITING_DEPOSIT";
  const showStatus = !!activeRouteId && !!activeRecord;

  const pending = useMemo(() => activity.filter((a) => a.status === "pending"), [activity]);

  // ---- which view + its morph key ----
  const viewKey = showStatus
    ? stage === "COMPLETED"
      ? "done"
      : stage === "FAILED"
        ? "failed"
        : stage === "AWAITING_DEPOSIT"
          ? "funding"
          : "routing"
    : view;

  // ---- morph motion config ----
  // GPU-only (transform + opacity) — no animated blur, which is a paint cost
  // that makes the morph feel laggy. Size springs; content crossfades on a fast
  // ease-out tween so view changes feel snappy.
  const sizeSpring = reduce ? { duration: 0.001 } : { type: "spring" as const, bounce: 0.12, duration: 0.4 };
  const contentTransition = reduce ? { duration: 0.12 } : { duration: 0.24, ease: [0.23, 1, 0.32, 1] as const };
  const contentVariants = {
    initial: { opacity: 0, scale: reduce ? 1 : 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: reduce ? 1 : 0.98 },
  };

  return (
    <div className="page-enter mx-auto flex w-full max-w-xl flex-col items-center gap-2.5 px-4 pb-8 pt-3 sm:gap-4 sm:pb-12 sm:pt-9">
      {viewKey === "form" ? (
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-1">
          <div
            className={cn(
              glassSurfaceVariants({ tone: "ink", depth: "raised", blur: "sm" }),
              "text-foreground/80 flex items-center gap-2 justify-self-start rounded-full px-4 py-2.5 text-sm font-semibold",
            )}
          >
            <ShieldCheck className="size-4" />
            {TEST_MODE ? "Testnet" : "Private route"}
          </div>
          <h1
            className={cn(
              glassSurfaceVariants({ tone: "ink", depth: "raised", blur: "sm" }),
              "text-foreground/80 flex items-center gap-2 justify-self-center rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap",
            )}
          >
            <Lock className="size-4" />
            Send privately
          </h1>
          <button
            type="button"
            onClick={() => setView("pending")}
            className={cn(
              glassSurfaceVariants({ tone: "ink", depth: "raised", blur: "sm" }),
              "press text-foreground/80 flex cursor-pointer items-center gap-2 justify-self-end rounded-full px-4 py-2.5 text-sm font-semibold",
            )}
          >
            Activity
            {pending.length > 0 ? (
              <span className="bg-brand text-brand-foreground flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                {pending.length}
              </span>
            ) : (
              <Clock className="size-4" />
            )}
          </button>
        </div>
      ) : null}

      <motion.div
        layout
        transition={sizeSpring}
        className={cn(
          glassSurfaceVariants({ tone: "ink", depth: "floating", blur: "sm" }),
          "text-foreground w-full overflow-hidden rounded-[2rem]",
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={viewKey}
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={contentTransition}
          >
            {/* ============================= FORM ============================= */}
            {viewKey === "form" ? (
              <div className="space-y-3 p-3 sm:p-4">
                {chainsError ? (
                  <ErrorNote title="Can't load networks" message={chainsError} onRetry={retryChains} />
                ) : null}

                <div
                  className={cn(
                    glassSurfaceVariants({ tone: "clear", depth: "raised", blur: "sm" }),
                    "border-foreground/[0.14] relative overflow-hidden rounded-[1.65rem] backdrop-saturate-150",
                  )}
                >
                  <RouteAssetRow
                    eyebrow="From"
                    tokenLogo={fromToken?.logoUrl}
                    symbol={fromToken?.symbol}
                    chainId={fromChain?.chainId}
                    chainLogo={fromChain?.logoUrl}
                    chainName={fromChain?.displayName}
                    onClick={() => setPicker("from")}
                    loading={chainsLoading || fromTokensLoading}
                  />
                  <div className="border-foreground/[0.07] relative mx-7 border-t">
                    <span className="border-foreground/[0.08] bg-background/85 text-foreground/40 absolute top-0 left-[28px] flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-lg">
                      <ArrowDown className="size-3.5" />
                    </span>
                  </div>
                  <RouteAssetRow
                    eyebrow="To"
                    tokenLogo={toToken?.logoUrl}
                    symbol={toToken?.symbol}
                    chainId={toChain?.chainId}
                    chainLogo={toChain?.logoUrl}
                    chainName={toChain?.displayName}
                    onClick={() => setPicker("to")}
                    loading={chainsLoading || toTokensLoading}
                  />
                </div>

                <div
                  className={cn(
                    glassSurfaceVariants({ tone: "clear", depth: "raised", blur: "sm" }),
                    "border-foreground/[0.14] rounded-[1.65rem] p-4 backdrop-saturate-150 sm:p-6",
                  )}
                >
                  <label htmlFor="bridge-amount" className="text-foreground/80 text-sm font-semibold">
                    Amount
                  </label>
                  <input
                    id="bridge-amount"
                    inputMode="decimal"
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                    className="text-foreground placeholder:text-foreground/30 mt-2 w-full bg-transparent text-4xl font-medium tracking-[-0.04em] tabular-nums outline-none sm:mt-4 sm:text-5xl"
                  />
                  <div className="mt-3 space-y-1 sm:mt-6">
                    <div className="text-foreground/45 text-sm">
                      {sendUsd != null ? `≈ ${formatUsd(sendUsd)}` : "$0"}
                    </div>
                    <div className="text-right text-sm">
                      {quoteLoading ? (
                        <Skeleton className="ml-auto h-4 w-40" />
                      ) : quote ? (
                        <span className="text-foreground/55">
                          Receive{" "}
                          <span className="text-foreground/90 font-semibold tabular-nums">
                            {formatAmount(quotedOut, quote.destSymbol)}
                          </span>
                          {receiveUsd != null ? (
                            <span className="text-foreground/45"> · {formatUsd(receiveUsd)}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-foreground/50">Receive 0 {toToken?.symbol ?? ""}</span>
                      )}
                    </div>
                  </div>
                </div>

                {quoteError && canQuote ? (
                  <ErrorNote title="Couldn't get a quote" message={quoteError} onRetry={quoteLoading ? undefined : retryQuote} />
                ) : null}
                {/* Recipient is collected on the next (route) step. */}
              </div>
            ) : null}

            {/* ======================= ROUTE CONFIRMATION ===================== */}
            {viewKey === "route" && quote && fromChain && toChain && fromToken && toToken ? (
              <div className="p-4 sm:p-6">
                <header className="mb-5 flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/12 ring-1 ring-emerald-500/20 ring-inset">
                    <SymbolGlyph symbol="RAIL" size={30} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground/40 text-xs font-medium">Via</p>
                    <h2 className="text-foreground truncate text-lg font-semibold">{pool}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRouteNeedsRecipient(false);
                      setView("form");
                    }}
                    className="bg-foreground/[0.05] text-foreground/45 hover:text-foreground flex size-10 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none"
                    aria-label="Close route"
                    disabled={creating}
                  >
                    <X className="size-5" />
                  </button>
                </header>

                {/* Recipient — a clean field on the card (no nested box), with a clear Scan button. */}
                {routeNeedsRecipient ? (
                  <div className="mb-5">
                    <label htmlFor="route-recipient" className="text-foreground/70 mb-2 block text-sm font-semibold">
                      Recipient address <span className="text-foreground/40 font-normal">· {toChain.displayName}</span>
                    </label>
                    <div className="relative">
                      <Input
                        id="route-recipient"
                        value={recipientAddr}
                        onChange={(event) => setRecipientAddr(event.target.value)}
                        placeholder={`0x… address on ${toChain.displayName}`}
                        autoFocus
                        className="border-foreground/[0.12] bg-background/25 text-foreground placeholder:text-foreground/40 focus-visible:border-brand/40 focus-visible:ring-brand/20 h-14 rounded-2xl border pl-4 pr-[6.5rem] text-base shadow-inner shadow-black/10 focus-visible:ring-1"
                      />
                      <button
                        type="button"
                        onClick={() => setScanOpen(true)}
                        className="bg-brand/15 text-brand hover:bg-brand/25 absolute right-2 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                        aria-label="Scan a wallet QR code"
                      >
                        <ScanQrCode className="size-4" /> Scan
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* From → To — flat rows on the card, connected by an arrow (no bordered sub-box). */}
                <div className="relative">
                  <div className="flex items-center gap-4 py-3">
                    <AssetGlyph symbol={fromToken.symbol} tokenLogo={fromToken.logoUrl} chainId={fromChain.chainId} chainLabel={fromChain.displayName} chainLogo={fromChain.logoUrl} size={46} />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground/45 truncate text-xs font-medium">{fromChain.displayName}</p>
                      <p className="text-foreground mt-0.5 text-2xl font-semibold tabular-nums">{formatAmount(amountNum, fromToken.symbol)}</p>
                    </div>
                  </div>
                  <div className="border-foreground/[0.08] relative border-t">
                    <span className="border-foreground/[0.08] bg-background text-foreground/40 absolute left-6 top-0 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border">
                      <ArrowDown className="size-3.5" />
                    </span>
                  </div>
                  <div className="flex items-center gap-4 py-3">
                    <AssetGlyph symbol={toToken.symbol} tokenLogo={toToken.logoUrl} chainId={toChain.chainId} chainLabel={toChain.displayName} chainLogo={toChain.logoUrl} size={46} />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground/45 truncate text-xs font-medium">{toChain.displayName}</p>
                      <p className="text-foreground mt-0.5 text-2xl font-semibold tabular-nums">{formatAmount(quotedOut, quote.destSymbol)}</p>
                    </div>
                  </div>
                </div>

                {/* Details — flat rows */}
                <div className="border-foreground/[0.08] divide-foreground/[0.07] mt-2 divide-y border-t text-sm">
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <span className="text-foreground/60 flex items-center gap-2"><Clock className="size-4" /> Transfer time</span>
                    <span className="text-foreground/85 font-semibold tabular-nums">{formatEta(quote.etaSeconds)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <span className="text-foreground/60 flex items-center gap-2"><Lock className="size-4" /> Total fee</span>
                    <span className="text-foreground/85 font-semibold tabular-nums">
                      {formatAmount(amountNum - quotedOut, quote.destSymbol)}
                    </span>
                  </div>
                </div>

                {createError && !creating ? <div className="mt-4"><ErrorNote title="Couldn't start the transfer" message={createError} onRetry={startManaged} /></div> : null}

                <button
                  type="button"
                  onClick={startManaged}
                  disabled={!ready || creating}
                  className="bg-foreground text-background hover:bg-foreground/90 mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                  {!recipient ? "Enter recipient address" : creating ? "Starting…" : "Start"}
                </button>
              </div>
            ) : null}

            {/* ============================ PENDING ========================== */}
            {viewKey === "pending" ? (
              <div className="p-5">
                <button type="button" onClick={() => setView("form")} className="press hover:bg-accent -ml-2 mb-4 w-fit cursor-pointer rounded-lg p-2" aria-label="Back">
                  <ArrowLeft className="size-5" />
                </button>
                <GradientHeading as="h2" size="sm" weight="semi">
                  In progress
                </GradientHeading>
                <p className="text-muted-foreground mt-2 text-sm">Tap a transfer to see its status.</p>

                {pending.length === 0 ? (
                  <p className="text-muted-foreground py-10 text-center text-sm">No transfers in progress.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {pending.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => a.live?.routeId && setActiveRouteId(a.live.routeId)}
                          className="press border-border hover:bg-accent/40 flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left"
                        >
                          {a.live ? <SymbolGlyph symbol={a.live.sendSymbol} logoUrl={a.live.sendLogo} size={34} /> : null}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{a.toLabel}</span>
                            <span className="text-brand flex items-center gap-1.5 text-xs">
                              <Loader2 className="size-3 animate-spin" />
                              {stageLabel(a.live?.stage)}
                            </span>
                          </span>
                          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {/* ======================= STATUS: FUNDING ======================= */}
            {viewKey === "funding" && activeRecord?.live ? (
              <div>
                <header className="border-border/60 flex items-center gap-3 border-b px-4 py-4">
                  <button type="button" onClick={() => setActiveRouteId(null)} className="press hover:bg-accent -ml-2 cursor-pointer rounded-lg p-2" aria-label="Back">
                    <ArrowLeft className="size-5" />
                  </button>
                  <h2 className="flex-1 text-base font-semibold">Deposit</h2>
                </header>
                <div className="space-y-5 p-5">
                  <div className="border-border bg-muted/30 space-y-2 rounded-2xl border p-4">
                    <p className="text-base leading-snug">
                      Send{" "}
                      <span className="text-foreground font-semibold">{formatAmount(activeRecord.sendAmount, activeRecord.live.sendSymbol)}</span>{" "}
                      on <span className="text-foreground font-semibold">{activeRecord.live.fromChainName}</span> below.
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Arrives privately as{" "}
                      <span className="text-foreground/90 font-semibold">{formatAmount(activeRecord.receiveAmount, activeRecord.live.recvSymbol)}</span>{" "}
                      at <span className="text-foreground/90 font-medium">{activeRecord.toLabel}</span>.
                    </p>
                  </div>

                  {activeRecord.live.depositAddress ? (
                    <>
                      <div className="flex justify-center">
                        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                          <QRCodeSVG value={activeRecord.live.depositAddress} size={168} bgColor="#ffffff" fgColor="#0a0a0a" marginSize={0} level="M" />
                        </div>
                      </div>
                      <div className="border-border rounded-2xl border p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-muted-foreground text-xs">Deposit address · {activeRecord.live.fromChainName}</p>
                          <button type="button" onClick={() => copyAddress(activeRecord.live!.depositAddress!)} className="press text-brand flex cursor-pointer items-center gap-1 text-xs font-medium">
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
                        <p className="mt-2 break-all text-sm">{activeRecord.live.depositAddress}</p>
                      </div>
                    </>
                  ) : null}

                  <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Watching for your deposit…
                  </div>

                  <PrivateRouteTrail
                    className="border-border/60 border-t pt-4"
                    fromChainId={activeRecord.live.fromChainId}
                    fromName={activeRecord.live.fromChainName}
                    fromLogo={activeRecord.live.fromChainLogo}
                    toChainId={activeRecord.live.toChainId}
                    toName={activeRecord.live.toChainName}
                    toLogo={activeRecord.live.toChainLogo}
                  />
                </div>
              </div>
            ) : null}

            {/* ======================= STATUS: ROUTING ======================= */}
            {viewKey === "routing" && activeRecord?.live ? (
              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRouteId(null);
                      setView("pending");
                    }}
                    className="press text-foreground/60 hover:text-foreground -ml-1 flex cursor-pointer items-center gap-1.5 text-sm font-medium"
                    aria-label="Back to activity"
                  >
                    <ArrowLeft className="size-4" /> Activity
                  </button>
                  <button
                    type="button"
                    onClick={() => copyAddress(`${window.location.origin}/tx/${activeRecord.live!.routeId}`)}
                    className="press text-foreground/60 hover:text-foreground flex cursor-pointer items-center gap-1.5 text-sm font-medium"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Loader2 className="text-brand size-10 animate-spin" />
                  <p className="mt-4 text-base font-medium">{stageLabel(stage)}</p>
                  <RoutingStatus etaSeconds={activeRecord.live.etaSeconds} startedAt={new Date(activeRecord.date).getTime()} />
                </div>
                <ol className="border-border divide-border divide-y rounded-2xl border">
                  {PROGRESS.map((p, i) => {
                    const idx = PROGRESS.findIndex((x) => x.status === stage);
                    const done = idx > i;
                    const active = idx === i;
                    return (
                      <li key={p.status} className="flex items-center gap-3 p-3.5">
                        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300", done ? "bg-brand/15 text-brand" : active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                          {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
                        </span>
                        <span className={cn("text-sm transition-colors duration-300", active ? "font-medium" : done ? "" : "text-muted-foreground")}>{p.label}</span>
                      </li>
                    );
                  })}
                </ol>
                <button type="button" onClick={() => setActiveRouteId(null)} className="press text-muted-foreground hover:text-foreground mx-auto block cursor-pointer text-center text-xs font-medium">
                  Continue in background
                </button>
              </div>
            ) : null}

            {/* ======================== STATUS: DONE ========================= */}
            {viewKey === "done" && activeRecord?.live ? (
              <div className="flex flex-col items-center p-6">
                <div className="bg-brand/12 text-brand ring-brand/20 mt-3 flex size-14 items-center justify-center rounded-full ring-1 ring-inset">
                  <Check className="size-7" />
                </div>
                <GradientHeading as="h2" size="sm" weight="semi" className="mt-4">
                  Sent privately
                </GradientHeading>
                <p className="text-muted-foreground mt-1 text-xs tabular-nums">{activeRecord.live.routeId}</p>
                <div className="border-border mt-6 w-full overflow-hidden rounded-2xl border text-left text-sm">
                  <div className="bg-muted/40 flex items-center gap-3 p-4">
                    <SymbolGlyph symbol={activeRecord.live.recvSymbol} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{activeRecord.toLabel}</p>
                      <p className="text-muted-foreground truncate text-xs">received on {activeRecord.live.toChainName}</p>
                    </div>
                    <p className="shrink-0 text-right font-semibold tabular-nums">+{formatAmount(activeRecord.receiveAmount, activeRecord.live.recvSymbol)}</p>
                  </div>
                  <div className="flex items-center justify-between p-4">
                    <span className="text-muted-foreground">Privacy</span>
                    <span className="text-brand font-medium">Anonymous</span>
                  </div>
                </div>
                <TextureButton
                  variant="brand"
                  size="lg"
                  className="mt-6"
                  onClick={() => {
                    setActiveRouteId(null);
                    resetForm();
                    setView("form");
                  }}
                >
                  Done
                </TextureButton>
              </div>
            ) : null}

            {/* ======================= STATUS: FAILED ======================== */}
            {viewKey === "failed" && activeRecord ? (
              <div className="flex flex-col items-center p-6 text-center">
                <div className="bg-destructive/12 text-destructive mt-3 flex size-14 items-center justify-center rounded-full">
                  <XCircle className="size-7" />
                </div>
                <h2 className="mt-4 text-xl font-semibold">Transfer failed</h2>
                <p className="text-muted-foreground mt-1 max-w-xs text-sm">Something went wrong routing this transfer. Any deposited funds are refunded to the sender.</p>
                <Button
                  size="lg"
                  variant="outline"
                  className="mt-6 h-12 w-full text-base"
                  onClick={() => {
                    setActiveRouteId(null);
                    resetForm();
                    setView("form");
                  }}
                >
                  Start over
                </Button>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {viewKey === "form" && quote && fromToken && toToken && toChain ? (
        <button
          type="button"
          onClick={() => {
            setRouteNeedsRecipient(!recipient);
            setView("route");
          }}
          className={cn(
            glassSurfaceVariants({ tone: "ink", depth: "floating", blur: "sm" }),
            "text-foreground w-full cursor-pointer rounded-[2rem] p-4 text-left ring-1 ring-brand/35 shadow-lg shadow-brand/10 [-webkit-tap-highlight-color:transparent] transition-shadow hover:shadow-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 sm:p-6",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="bg-foreground/[0.055] text-foreground/75 inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold">
              <ShieldCheck className="text-brand size-3.5 shrink-0" />
              <span className="truncate">Route found · {pool}</span>
            </span>
            <span className="bg-foreground/[0.045] text-foreground/60 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums">
              {formatEta(quote.etaSeconds)} <Clock className="size-3.5" />
            </span>
          </div>

          <div className="mt-4 flex items-center gap-4 sm:mt-8">
            <AssetGlyph
              symbol={toToken.symbol}
              tokenLogo={toToken.logoUrl}
              chainId={toChain.chainId}
              chainLabel={toChain.displayName}
              chainLogo={toChain.logoUrl}
              size={52}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">
                {formatAmount(quotedOut, quote.destSymbol)}
              </p>
              <p className="text-foreground/38 mt-1 text-sm">
                {receiveUsd != null ? formatUsd(receiveUsd) : `on ${toChain.displayName}`}
              </p>
            </div>
            <span className="relative flex size-10 shrink-0 items-center justify-center">
              {reduce ? null : (
                <motion.span
                  aria-hidden
                  className="bg-brand/40 absolute inset-0 rounded-full"
                  animate={{ scale: [1, 1.7], opacity: [0.55, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <motion.span
                className="bg-brand text-background relative flex size-10 items-center justify-center rounded-full shadow-lg shadow-brand/30"
                animate={reduce ? undefined : { scale: [1, 1.12, 1] }}
                transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <ChevronRight className="size-5" />
              </motion.span>
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 text-xs font-semibold sm:mt-8">
            <span className="bg-foreground/[0.045] text-foreground/60 rounded-full px-3 py-1.5">
              Private route
            </span>
            <span className="text-foreground/38 tabular-nums">
              {quote.feeUsd != null && quote.feeUsd > 0 ? `${formatUsd(quote.feeUsd)} fees` : "No extra fees"}
            </span>
          </div>
        </button>
      ) : viewKey === "form" && quoteLoading && amountNum > 0 ? (
        <div className="border-foreground/[0.08] bg-background/20 text-foreground/45 flex size-11 items-center justify-center rounded-full border backdrop-blur-sm">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : null}

      {/* route footer for the active transfer (deposit view shows it inside the card) */}
      {showStatus && stage !== "FAILED" && stage !== "AWAITING_DEPOSIT" && activeRecord?.live ? (
        <motion.div layout transition={sizeSpring} className="mt-4">
          <PrivateRouteTrail
            fromChainId={activeRecord.live.fromChainId}
            fromName={activeRecord.live.fromChainName}
            fromLogo={activeRecord.live.fromChainLogo}
            toChainId={activeRecord.live.toChainId}
            toName={activeRecord.live.toChainName}
            toLogo={activeRecord.live.toChainLogo}
          />
        </motion.div>
      ) : null}

      {/* asset + recipient pickers (portaled; only meaningful on the form) */}
      <AssetPicker
        open={picker === "from"}
        onOpenChange={(o) => setPicker(o ? "from" : null)}
        title="You send"
        description="Pick the token and network you're sending from."
        items={fromTokenItems}
        onSelect={(address) => {
          const t = fromTokens.find((x) => x.address === address);
          if (t) setFromToken(t);
        }}
        chains={chainChips}
        activeChainId={fromChainId != null ? String(fromChainId) : undefined}
        onChainSelect={(id) => setFromChainId(Number(id))}
        activeItemId={fromToken?.address}
        loading={fromTokensLoading}
      />
      <AssetPicker
        open={picker === "to"}
        onOpenChange={(o) => setPicker(o ? "to" : null)}
        title="You receive"
        description="Pick the token and network to receive. It can differ from what you send."
        items={toTokenItems}
        onSelect={(address) => {
          const t = toTokens.find((x) => x.address === address);
          if (t) setToToken(t);
        }}
        chains={chainChips}
        activeChainId={toChainId != null ? String(toChainId) : undefined}
        onChainSelect={(id) => setToChainId(Number(id))}
        activeItemId={toToken?.address}
        loading={toTokensLoading}
      />

      <QrScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={(value) => setRecipientAddr(normalizeScannedAddress(value))}
      />
    </div>
  );
}
