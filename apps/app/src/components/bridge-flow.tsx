"use client";

// The entire bridge experience on ONE page as a Dynamic-Island-style morph:
// a single container that springs its shape/size and crossfades its contents as
// the user acts. Views:
//   form     — enter amount, pick assets + recipient, live quote
//   method   — choose how funds are handled (managed / self-custody)
//   status   — a specific transfer's live state (funding → routing → done/failed)
//   pending  — the list of in-flight transfers (opened from the badge)
//
// A transfer, once created, is recorded locally (see store.upsertActivity) and
// its status is polled app-wide by <TxTracker>; this screen just reads the
// record. So the badge count, the pending list, and each status view all reflect
// the same persisted, self-updating source of truth.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import { GradientHeading } from "@erebuz/ui/components/gradient-heading";
import { Input } from "@erebuz/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@erebuz/ui/components/popover";
import { Skeleton } from "@erebuz/ui/components/skeleton";
import { TextureButton } from "@erebuz/ui/components/texture-button";
import { TextureCard } from "@erebuz/ui/components/texture-card";
import { cn } from "@erebuz/ui/lib/utils";

import { AssetPicker, type ChainChip, type PickerItem } from "@/components/asset-picker";
import { ErrorNote } from "@/components/error-note";
import {
  AssetGlyph,
  ChainGlyph,
  GradientAvatar,
  InitialCircle,
  SymbolGlyph,
} from "@/components/crypto-icon";
// import { DestinationDialog, type Destination } from "@/components/destination-dialog";
import { OptionCard } from "@/components/option-card";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Activity } from "@/lib/mock-data";
import { useChains, useTokens } from "@/lib/tee-data";
import { fromSmallestUnit, tee, type CreatedRoute, type TeeQuote, type TeeToken } from "@/lib/tee";

export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE === "true";
const DEFAULT_FROM_CHAIN = TEST_MODE ? 84532 : 8453; // Base Sepolia : Base
const DEFAULT_TO_CHAIN = TEST_MODE ? 84532 : 137; // Base Sepolia : Polygon
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
  return `~${Math.max(1, Math.round(seconds / 60))} min`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
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
function RoutingStatus({ etaSeconds }: { etaSeconds?: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  // A minute past the quoted estimate (min 2.5m) counts as "longer than usual".
  const slow = seconds > Math.max(150, (etaSeconds ?? 120) + 60);
  return (
    <>
      <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-sm">
        <Clock className="size-3.5" />
        <span className="tabular-nums">
          {mm}:{ss.toString().padStart(2, "0")}
        </span>{" "}
        elapsed
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

type View = "form" | "method" | "pending";

/** Token-on-chain pill (Relay/Jumper-style trigger), driven by remote logos. */
function AssetSelect({
  tokenLogo,
  symbol,
  chainId,
  chainLogo,
  chainName,
  onClick,
  loading,
}: {
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
      <div className="border-border flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pr-3 pl-1.5">
        <Skeleton className="size-[30px] rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-2 w-8" />
        </div>
        <ChevronDown className="text-muted-foreground size-4" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="press border-border bg-card hover:bg-accent flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full border py-1.5 pr-3 pl-1.5 shadow-sm shadow-black/[0.03] dark:shadow-black/20"
    >
      {symbol ? (
        <AssetGlyph
          symbol={symbol}
          tokenLogo={tokenLogo}
          chainId={chainId}
          chainLabel={chainName ?? ""}
          chainLogo={chainLogo}
          size={30}
        />
      ) : (
        <span className="bg-muted flex size-[30px] items-center justify-center rounded-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </span>
      )}
      <span className="text-left">
        <span className="block text-sm leading-tight font-semibold">{symbol ?? "Select"}</span>
        <span className="text-muted-foreground block text-[11px] leading-tight">
          {chainName ?? "token"}
        </span>
      </span>
      <ChevronDown className="text-muted-foreground size-4" />
    </button>
  );
}

export function BridgeFlow() {
  const { cards, contacts, activity, upsertActivity } = useApp();
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

  // Only quote while the form is the active view (no point polling behind a
  // status/method/pending morph).
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
  // The privacy pool the route goes through is the middle hop of quote.route,
  // e.g. "Private pool (Arbitrum)". The TEE returns a single route (one pool),
  // so there's nothing to choose between.
  const pool = quote?.route?.[1] ?? "Private pool";

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
        route: [fromChain.displayName, "Private", toChain.displayName],
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

  const cta = !fromToken
    ? "Select a token"
    : amountNum <= 0
      ? "Enter an amount"
      : !recipient
        ? "Choose a recipient"
        : quoteLoading
          ? "Fetching quote…"
          : quoteError
            ? "Route unavailable"
            : "Review transfer";

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
    <div className="page-enter mx-auto flex w-full max-w-md flex-col items-center gap-8 px-4 py-8 sm:gap-10 sm:py-12">
      {/* hero */}
      <GradientHeading as="h1" size="xl" weight="black" className="whitespace-nowrap text-5xl sm:text-6xl lg:text-7xl">Send Privately, Anywhere</GradientHeading>

      <motion.div
        layout
        transition={sizeSpring}
        className="border-border bg-card overflow-hidden rounded-3xl border shadow-sm shadow-black/[0.04] dark:shadow-2xl dark:shadow-black/40"
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
              <div className="p-5">
                {pending.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setView("pending")}
                    className="press bg-brand/10 text-brand ring-brand/20 mb-4 flex w-full cursor-pointer items-center gap-2 rounded-full py-1.5 pr-2 pl-3 text-xs font-medium ring-1 ring-inset"
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="flex-1 text-left">
                      {pending.length} transfer{pending.length > 1 ? "s" : ""} in progress
                    </span>
                    <ChevronRight className="size-3.5" />
                  </button>
                ) : null}


                {chainsError ? (
                  <ErrorNote className="mt-4" title="Can't load networks" message={chainsError} onRetry={retryChains} />
                ) : null}

                {/* send / receive */}
                <div className="border-border bg-foreground/[0.02] relative mt-4 rounded-2xl border">
                  <div className="p-4">
                    <span className="text-muted-foreground text-sm">You send</span>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        inputMode="decimal"
                        autoFocus
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="0"
                        className="placeholder:text-muted-foreground/40 w-full min-w-0 bg-transparent text-3xl font-semibold tracking-tight tabular-nums outline-none"
                      />
                      <AssetSelect
                        tokenLogo={fromToken?.logoUrl}
                        symbol={fromToken?.symbol}
                        chainId={fromChain?.chainId}
                        chainLogo={fromChain?.logoUrl}
                        chainName={fromChain?.displayName}
                        onClick={() => setPicker("from")}
                        loading={chainsLoading || fromTokensLoading}
                      />
                    </div>
                    {sendUsd != null ? <div className="text-muted-foreground mt-1.5 text-sm">≈ {formatUsd(sendUsd)}</div> : null}
                  </div>

                  <div className="border-border relative border-t">
                    <span className="bg-card border-border text-muted-foreground absolute top-0 left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm shadow-black/[0.03] dark:shadow-black/30">
                      <ArrowDown className="size-3.5" />
                    </span>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">They receive</span>
                      {receiveUsd != null ? <span className="text-muted-foreground text-xs">≈ {formatUsd(receiveUsd)}</span> : null}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className={cn("w-full min-w-0 text-3xl font-semibold tracking-tight tabular-nums", quote ? "" : "text-muted-foreground/40")}>
                        {quote ? formatAmount(quotedOut) : quoteLoading ? <Skeleton className="h-8 w-28" /> : "0"}
                      </span>
                      <AssetSelect
                        tokenLogo={toToken?.logoUrl}
                        symbol={toToken?.symbol}
                        chainId={toChain?.chainId}
                        chainLogo={toChain?.logoUrl}
                        chainName={toChain?.displayName}
                        onClick={() => setPicker("to")}
                        loading={chainsLoading || toTokensLoading}
                      />
                    </div>
                  </div>
                </div>

                {quoteError && canQuote ? (
                  <ErrorNote className="mt-3" title="Couldn't get a quote" message={quoteError} onRetry={quoteLoading ? undefined : retryQuote} />
                ) : null}

                {/* Quote details — a fixed-height trigger (shown once an amount is
                    entered) with the breakdown in a portaled popover, so the
                    bridge never changes height as the quote updates. */}
                {amountNum > 0 && !quoteError ? (
                  <Popover>
                    <PopoverTrigger className="press border-border bg-foreground/[0.02] hover:bg-accent/40 mt-3 flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="bg-brand/10 text-brand ring-brand/20 inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset">
                          <Lock className="size-3 shrink-0" />
                          <span className="truncate">{pool}</span>
                        </span>
                      </span>
                      <span className="text-muted-foreground flex shrink-0 items-center gap-1.5">
                        {quote ? (
                          <span className="tabular-nums">{formatEta(quote.etaSeconds)}</span>
                        ) : (
                          <Skeleton className="h-3.5 w-10" />
                        )}
                        <ChevronDown className="size-4" />
                      </span>
                    </PopoverTrigger>
                    <PopoverContent align="center" sideOffset={8} className="w-(--anchor-width)">
                      <div className="space-y-2.5 text-sm">
                        <Row label="You receive">
                          {quote ? (
                            <span className="tabular-nums">{formatAmount(quotedOut, quote.destSymbol)}</span>
                          ) : (
                            <Skeleton className="h-4 w-24" />
                          )}
                        </Row>
                        <Row label="Pool">
                          <span className="font-medium">{pool}</span>
                        </Row>
                        <Row label="Network gas">
                          <span className="text-brand font-medium">Covered</span>
                        </Row>
                        <Row label="Privacy">
                          <span className="text-brand font-medium">Anonymous</span>
                        </Row>
                        <Row label="Estimated time">
                          {quote ? (
                            <span className="tabular-nums">{formatEta(quote.etaSeconds)}</span>
                          ) : (
                            <Skeleton className="h-4 w-14" />
                          )}
                        </Row>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}

                <label className="text-muted-foreground mt-3 block text-xs font-medium">Recipient address</label>
                <Input
                  value={recipientAddr}
                  onChange={(e) => setRecipientAddr(e.target.value)}
                  placeholder="0x… or any chain address"
                  className="mt-1.5"
                />

                <TextureButton variant="brand" size="lg" className="mt-4" disabled={!ready} onClick={() => setView("method")}>
                  {quoteLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                  {cta}
                </TextureButton>

                <p className="text-muted-foreground mt-5 flex items-center justify-center gap-1.5 text-center text-xs leading-relaxed">
                  <Lock className="size-3" />
                  Private and compliant by design.
                </p>
              </div>
            ) : null}

            {/* ============================ METHOD =========================== */}
            {viewKey === "method" ? (
              <div className="p-5">
                <button
                  type="button"
                  onClick={() => setView("form")}
                  className="press hover:bg-accent -ml-2 mb-4 w-fit cursor-pointer rounded-lg p-2"
                  aria-label="Back"
                  disabled={creating}
                >
                  <ArrowLeft className="size-5" />
                </button>

                {fromChain && toChain && fromToken && toToken && quote ? (
                  <TextureCard>
                    <div className="text-foreground flex items-center gap-3 p-4">
                      <AssetGlyph symbol={quote.destSymbol} tokenLogo={toToken.logoUrl} chainId={toChain.chainId} chainLabel={toChain.displayName} chainLogo={toChain.logoUrl} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {formatAmount(amountNum, fromToken.symbol)} on {fromChain.displayName}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          to {recipient?.label} on {toChain.displayName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{formatAmount(quotedOut, quote.destSymbol)}</p>
                        <p className="text-muted-foreground text-xs">they receive</p>
                      </div>
                    </div>
                  </TextureCard>
                ) : null}

                <div className="mt-6 mb-5">
                  <GradientHeading as="h2" size="sm" weight="semi">
                    How do you want to send?
                  </GradientHeading>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">Choose how your funds are handled for this transfer.</p>
                </div>

                <div className="space-y-3">
                  <OptionCard
                    icon={ShieldCheck}
                    title="Managed"
                    badge="Recommended"
                    description={creating ? "Preparing your private transfer…" : "Secured in a protected enclave. Gasless, recoverable, easiest."}
                    onClick={startManaged}
                    loading={creating}
                  />
                  {createError && !creating ? <ErrorNote title="Couldn't start the transfer" message={createError} onRetry={startManaged} /> : null}
                  <OptionCard icon={KeyRound} title="Self-custody" badge="Coming soon" badgeVariant="outline" description="Hold your own keys and sign each step yourself." disabled />
                </div>
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
                  <div className="border-border bg-muted/30 space-y-1 rounded-2xl border p-4">
                    <p className="text-muted-foreground text-sm">Deposit to complete</p>
                    <p className="text-sm leading-relaxed">
                      Send <span className="font-medium">{formatAmount(activeRecord.sendAmount, activeRecord.live.sendSymbol)}</span> on{" "}
                      {activeRecord.live.fromChainName} to the address below. We&apos;ll route it privately to {activeRecord.toLabel}. You&apos;ll receive{" "}
                      <span className="font-medium">{formatAmount(activeRecord.receiveAmount, activeRecord.live.recvSymbol)}</span>.
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
                </div>
              </div>
            ) : null}

            {/* ======================= STATUS: ROUTING ======================= */}
            {viewKey === "routing" && activeRecord?.live ? (
              <div className="space-y-6 p-6">
                <div className="flex flex-col items-center text-center">
                  <Loader2 className="text-brand size-10 animate-spin" />
                  <p className="mt-6 text-base font-medium">{stageLabel(stage)}</p>
                  <RoutingStatus etaSeconds={activeRecord.live.etaSeconds} />
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

      {/* route footer for the active transfer */}
      {showStatus && stage !== "FAILED" && activeRecord?.live ? (
        <motion.div layout transition={sizeSpring} className="text-muted-foreground mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <ChainGlyph chainId={activeRecord.live.fromChainId} logoUrl={activeRecord.live.fromChainLogo} label={activeRecord.live.fromChainName} size={14} />
          <span>{activeRecord.live.fromChainName}</span>
          <span className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full px-1.5 py-0.5">
            <Lock className="size-3" />
            Private
          </span>
          <ChainGlyph chainId={activeRecord.live.toChainId} logoUrl={activeRecord.live.toChainLogo} label={activeRecord.live.toChainName} size={14} />
          <span>{activeRecord.live.toChainName}</span>
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
    </div>
  );
}
