"use client";

// The public entry: a Jumper/1inch-style swap+bridge quote screen. Token + chain
// selectors are sourced live from the TEE (all Relay-bridgeable chains); the
// quote (guaranteed output + fee) is a live TEE call. Confirm carries the draft
// to the method screen - no login needed to get a quote.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ChevronDown, Loader2, Plus } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import { Skeleton } from "@erebuz/ui/components/skeleton";
import { cn } from "@erebuz/ui/lib/utils";

import { AssetPicker, type ChainChip, type PickerItem } from "@/components/asset-picker";
import {
  GradientAvatar,
  InitialCircle,
  RemoteAssetGlyph,
  RemoteGlyph,
} from "@/components/crypto-icon";
import { DestinationDialog, type Destination } from "@/components/destination-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import { useRouteDraft, type RouteDraft } from "@/lib/route-draft";
import { useApp } from "@/lib/store";
import { useChains, useTokens } from "@/lib/tee-data";
import { fromSmallestUnit, tee, type TeeQuote, type TeeToken } from "@/lib/tee";

const DEFAULT_FROM_CHAIN = 8453; // Base
const DEFAULT_TO_CHAIN = 137; // Polygon
const DEFAULT_SYMBOL = "USDC";

function formatEta(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `~${mins} min`;
}

/** Token-on-chain pill (Relay/Jumper-style trigger), driven by remote logos. */
function AssetSelect({
  tokenLogo,
  symbol,
  chainLogo,
  chainName,
  onClick,
  loading,
}: {
  tokenLogo?: string | null;
  symbol?: string;
  chainLogo?: string | null;
  chainName?: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border bg-card hover:bg-accent flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3 transition-colors"
    >
      {symbol ? (
        <RemoteAssetGlyph
          tokenLogo={tokenLogo}
          tokenLabel={symbol}
          chainLogo={chainLogo}
          chainLabel={chainName ?? ""}
          size={30}
        />
      ) : (
        <span className="bg-muted flex size-[30px] items-center justify-center rounded-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </span>
      )}
      <span className="text-left">
        <span className="block text-sm font-semibold leading-tight">{symbol ?? "Select"}</span>
        <span className="text-muted-foreground block text-[11px] leading-tight">
          {chainName ?? "token"}
        </span>
      </span>
      <ChevronDown className="text-muted-foreground size-4" />
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function QuotePanel() {
  const router = useRouter();
  const { setDraft } = useRouteDraft();
  const { cards, contacts } = useApp();

  const { chains, loading: chainsLoading, error: chainsError } = useChains();

  // User selections start null and fall back to derived defaults - deriving
  // (rather than syncing via effects) keeps the choice reactive to the async
  // chain/token lists without cascading renders.
  const [fromChainSel, setFromChainId] = useState<number | null>(null);
  const [toChainSel, setToChainId] = useState<number | null>(null);
  const [fromTokenSel, setFromToken] = useState<TeeToken | null>(null);
  const [toTokenSel, setToToken] = useState<TeeToken | null>(null);
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState<Destination | null>(null);

  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [destOpen, setDestOpen] = useState(false);

  const fromChainId =
    fromChainSel ??
    (chains.length
      ? (chains.some((c) => c.chainId === DEFAULT_FROM_CHAIN) ? DEFAULT_FROM_CHAIN : chains[0].chainId)
      : null);
  const toChainId =
    toChainSel ??
    (chains.length
      ? (chains.find((c) => c.chainId === DEFAULT_TO_CHAIN)?.chainId ??
        chains.find((c) => c.chainId !== fromChainId)?.chainId ??
        chains[0].chainId)
      : null);

  const { tokens: fromTokens, loading: fromTokensLoading } = useTokens(fromChainId);
  const { tokens: toTokens, loading: toTokensLoading } = useTokens(toChainId);

  // Effective from-token: the user's pick if still valid on this chain, else the
  // chain's USDC (or first token).
  const fromToken = useMemo<TeeToken | null>(() => {
    if (fromTokenSel && fromTokens.some((t) => t.address === fromTokenSel.address)) return fromTokenSel;
    return fromTokens.find((t) => t.symbol.toUpperCase() === DEFAULT_SYMBOL) ?? fromTokens[0] ?? null;
  }, [fromTokenSel, fromTokens]);

  // Effective to-token: the user's pick if still valid on the dest chain, else
  // mirror the source symbol (same-asset default), else USDC / first.
  const toToken = useMemo<TeeToken | null>(() => {
    if (toTokenSel && toTokens.some((t) => t.address === toTokenSel.address)) return toTokenSel;
    const mirror =
      fromToken && toTokens.find((t) => t.symbol.toUpperCase() === fromToken.symbol.toUpperCase());
    return mirror ?? toTokens.find((t) => t.symbol.toUpperCase() === DEFAULT_SYMBOL) ?? toTokens[0] ?? null;
  }, [toTokenSel, toTokens, fromToken]);

  const fromChain = useMemo(
    () => chains.find((c) => c.chainId === fromChainId) ?? null,
    [chains, fromChainId]
  );
  const toChain = useMemo(
    () => chains.find((c) => c.chainId === toChainId) ?? null,
    [chains, toChainId]
  );

  // ---- recipient ----
  const recipient = useMemo(() => {
    if (!dest) return null;
    if (dest.kind === "card") {
      const c = cards.find((x) => x.id === dest.id);
      return c
        ? { address: c.address, label: c.name, sublabel: shortenAddress(c.address), icon: <InitialCircle label={c.name} color={c.color} /> }
        : null;
    }
    if (dest.kind === "contact") {
      const c = contacts.find((x) => x.id === dest.id);
      return c
        ? { address: c.address, label: c.name, sublabel: c.handle ?? shortenAddress(c.address), icon: <GradientAvatar seed={c.address} label={c.name} /> }
        : null;
    }
    return {
      address: dest.address,
      label: shortenAddress(dest.address),
      sublabel: "Wallet address",
      icon: <GradientAvatar seed={dest.address} />,
    };
  }, [dest, cards, contacts]);

  // ---- live quote ----
  // Prices move (especially for volatile pairs), so the quote is refreshed on
  // every input change AND on a 20s timer. It is a live estimate, not a locked
  // amount - the user reviews the current number and opts in.
  const REFRESH_MS = 20_000;
  const [quote, setQuote] = useState<TeeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const amountNum = Number(amount) || 0;
  const canQuote = Boolean(
    fromToken && toToken && fromChainId != null && toChainId != null && amountNum > 0
  );

  const runQuote = useCallback(
    (silent: boolean, i: {
      sourceChainId: number;
      destChainId: number;
      amount: string;
      tokenSymbol: string;
      destTokenSymbol: string;
    }) => {
      const id = ++reqIdRef.current;
      if (silent) setRefreshing(true);
      else setQuoteLoading(true);
      setQuoteError(null);
      tee
        .quote(i)
        .then((q) => {
          if (id !== reqIdRef.current) return;
          setQuote(q);
          setQuoteLoading(false);
          setRefreshing(false);
        })
        .catch((e: Error) => {
          if (id !== reqIdRef.current) return;
          if (!silent) {
            setQuote(null);
            setQuoteError(e.message);
          }
          setQuoteLoading(false);
          setRefreshing(false);
        });
    },
    []
  );

  // Debounced quote on input change + a silent refresh timer, so the live quote
  // tracks the market. The interval is captured with the current inputs and
  // reset whenever they change.
  useEffect(() => {
    const id = ++reqIdRef.current;
    if (!canQuote || !fromToken || !toToken || fromChainId == null || toChainId == null) {
      queueMicrotask(() => {
        if (id !== reqIdRef.current) return;
        setQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        setRefreshing(false);
      });
      return;
    }
    const i = {
      sourceChainId: fromChainId,
      destChainId: toChainId,
      amount,
      tokenSymbol: fromToken.symbol,
      destTokenSymbol: toToken.symbol,
    };
    const t = setTimeout(() => runQuote(false, i), 450);
    const iv = setInterval(() => runQuote(true, i), REFRESH_MS);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [canQuote, fromToken, toToken, fromChainId, toChainId, amount, runQuote]);

  const quotedOut = quote ? fromSmallestUnit(quote.quotedOutputAmount, quote.destDecimals) : 0;
  const feeToken = quote ? fromSmallestUnit(quote.feeAmount, quote.destDecimals) : 0;
  const sendUsd = quote?.amountInUsd ?? null;
  const receiveUsd = quote?.quotedOutputUsd ?? null;

  // ---- picker item lists ----
  const chainChips: ChainChip[] = useMemo(
    () =>
      chains.map((c) => ({
        id: String(c.chainId),
        label: c.displayName,
        icon: <RemoteGlyph src={c.logoUrl} label={c.displayName} size={24} />,
      })),
    [chains]
  );

  const toPickerItems = (tokens: TeeToken[]): PickerItem[] =>
    tokens.map((t) => ({
      id: t.address,
      label: t.symbol,
      sublabel: t.name,
      icon: <RemoteGlyph src={t.logoUrl} label={t.symbol} size={32} />,
    }));
  const fromTokenItems = useMemo(() => toPickerItems(fromTokens), [fromTokens]);
  const toTokenItems = useMemo(() => toPickerItems(toTokens), [toTokens]);

  const ready = Boolean(quote && !quoteError && recipient && canQuote);

  const confirm = () => {
    if (!ready || !quote || !fromChain || !fromToken || !toChain || !toToken || !recipient) return;
    const draft: RouteDraft = {
      fromChain,
      fromToken,
      toChain,
      toToken,
      amount,
      recipientAddress: recipient.address,
      quote,
    };
    setDraft(draft);
    router.push("/method");
  };

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

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-12">
      {/* brand + theme */}
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-950">
            <Image src="/wall8-logo.svg" alt="wall8" width={18} height={18} priority unoptimized />
          </span>
          <span className="text-lg font-semibold tracking-tight">wall8</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight">Send privately</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bridge across chains with the on-chain trail broken. You get a live quote before
            anything moves.
          </p>
        </div>

        {chainsError ? (
          <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-2xl border p-4 text-sm">
            Couldn&apos;t reach the service: {chainsError}
          </div>
        ) : null}

        {/* connected bridge panel */}
        <div className="border-border bg-muted/30 relative rounded-2xl border">
          {/* you send */}
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
                chainLogo={fromChain?.logoUrl}
                chainName={fromChain?.displayName}
                onClick={() => setPicker("from")}
                loading={chainsLoading || fromTokensLoading}
              />
            </div>
            {sendUsd != null ? (
              <div className="text-muted-foreground mt-1.5 text-sm">≈ {formatUsd(sendUsd)}</div>
            ) : null}
          </div>

          {/* seam */}
          <div className="border-border relative border-t">
            <span className="bg-card border-border text-muted-foreground absolute left-1/2 top-0 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border">
              <ArrowLeft className="size-3.5 -rotate-90" />
            </span>
          </div>

          {/* they receive */}
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">They receive</span>
              {receiveUsd != null ? (
                <span className="text-muted-foreground text-xs">≈ {formatUsd(receiveUsd)}</span>
              ) : null}
            </div>

            <div className="mt-2 flex items-center gap-3">
              <span
                className={cn(
                  "w-full min-w-0 text-3xl font-semibold tracking-tight tabular-nums",
                  quote ? "" : "text-muted-foreground/40"
                )}
              >
                {quoteLoading ? (
                  <Skeleton className="h-8 w-28" />
                ) : quote ? (
                  formatAmount(quotedOut)
                ) : (
                  "0"
                )}
              </span>
              <AssetSelect
                tokenLogo={toToken?.logoUrl}
                symbol={toToken?.symbol}
                chainLogo={toChain?.logoUrl}
                chainName={toChain?.displayName}
                onClick={() => setPicker("to")}
                loading={chainsLoading || toTokensLoading}
              />
            </div>
          </div>
        </div>

        {/* live route + fees */}
        {quoteError && canQuote ? (
          <p className="text-destructive mt-3 text-sm">{quoteError}</p>
        ) : null}

        {quote && !quoteError ? (
          <div className="animate-step-in border-border mt-3 rounded-2xl border px-4 py-3.5 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-brand flex items-center gap-1.5 text-xs font-medium">
                <span className="relative flex size-2">
                  <span className="bg-brand absolute inline-flex size-full animate-ping rounded-full opacity-60" />
                  <span className="bg-brand relative inline-flex size-2 rounded-full" />
                </span>
                Live quote
              </span>
              {refreshing ? (
                <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
              ) : (
                <span className="text-muted-foreground text-[11px]">updates every 20s</span>
              )}
            </div>
            <div className="space-y-2.5">
              <Row label="You receive">
                <span className="tabular-nums">{formatAmount(quotedOut, quote.destSymbol)}</span>
              </Row>
              <Row label="Fee">
                {quote.feeUsd != null ? formatUsd(quote.feeUsd) : formatAmount(feeToken, quote.destSymbol)}
              </Row>
              <Row label="Network gas">
                <span className="text-brand font-medium">Covered</span>
              </Row>
              <Row label="Privacy">
                <span className="text-brand font-medium">Confidential</span>
              </Row>
              <Row label="Estimated time">{formatEta(quote.etaSeconds)}</Row>
              <div className="border-border flex items-center justify-between gap-3 border-t pt-2.5">
                <span className="text-muted-foreground">Route</span>
                <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
                  <span className="flex items-center gap-1">
                    <RemoteGlyph src={fromChain?.logoUrl} label={fromChain?.displayName ?? ""} size={15} />
                    <span className="font-medium">{fromChain?.displayName}</span>
                  </span>
                  <span className="text-brand">{"→"} Private {"→"}</span>
                  <span className="flex items-center gap-1">
                    <RemoteGlyph src={toChain?.logoUrl} label={toChain?.displayName ?? ""} size={15} />
                    <span className="font-medium">{toChain?.displayName}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* recipient - where the funds land, kept at the bottom just above the CTA */}
        <button
          type="button"
          onClick={() => setDestOpen(true)}
          className="border-border bg-card hover:bg-accent/40 mt-3 flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors"
        >
          {recipient ? (
            recipient.icon
          ) : (
            <span className="bg-muted flex size-9 items-center justify-center rounded-full">
              <Plus className="text-muted-foreground size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-xs">Recipient</span>
            <span className="block truncate text-sm font-medium">
              {recipient ? recipient.label : "Choose recipient"}
            </span>
            {recipient ? (
              <span className="text-muted-foreground block truncate text-xs">
                {recipient.sublabel}
              </span>
            ) : null}
          </span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </button>

        <Button
          size="lg"
          className="mt-4 h-12 w-full text-base font-semibold"
          disabled={!ready}
          onClick={confirm}
        >
          {cta}
        </Button>

        <p className="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
          Private and compliant by design. Live pricing from our routing engine.
        </p>
      </div>

      {/* from: token + chain */}
      <AssetPicker
        open={picker === "from"}
        onOpenChange={(o) => setPicker(o ? "from" : null)}
        title="You send"
        description="Pick the token and network you're sending from."
        searchPlaceholder="Search tokens…"
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

      {/* to: token + chain (cross-token supported) */}
      <AssetPicker
        open={picker === "to"}
        onOpenChange={(o) => setPicker(o ? "to" : null)}
        title="You receive"
        description="Pick the token and network to receive. It can differ from what you send."
        searchPlaceholder="Search tokens…"
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

      <DestinationDialog open={destOpen} onOpenChange={setDestOpen} onSelect={setDest} />
    </div>
  );
}
