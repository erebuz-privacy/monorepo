"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import { cn } from "@erebuz/ui/lib/utils";

import { AssetPicker } from "@/components/asset-picker";
import {
  GradientAvatar,
  InitialCircle,
  NetworkGlyph,
  RouteTrail,
  TokenGlyph,
  TokenOnChainGlyph,
} from "@/components/crypto-icon";
import {
  DestinationDialog,
  type Destination,
} from "@/components/destination-dialog";
import { ImportTokenDialog } from "@/components/import-token-dialog";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import {
  CHAINS,
  HOLDINGS,
  chainById,
  type Chain,
  type Token,
} from "@/lib/mock-data";
import {
  computeQuote,
  createDepositAccount,
  executeSend,
  type Receipt,
} from "@/lib/mock-sdk";
import { useApp } from "@/lib/store";

type Step =
  | "compose"
  | "deposit"
  | "checking"
  | "compliance"
  | "sign"
  | "success";
type PickerKind = "from" | "to";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function holdingAmount(chainId: string, tokenId: string): number {
  return (
    HOLDINGS.find((h) => h.chainId === chainId && h.tokenId === tokenId)
      ?.amount ?? 0
  );
}

/** Combined token-on-chain selector (Relay/Jumper-style). */
function AssetSelect({
  token,
  chain,
  onClick,
  locked,
}: {
  token: Token;
  chain: Chain;
  onClick?: () => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      className={cn(
        "border-border bg-card flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3 transition-colors",
        locked ? "cursor-default" : "hover:bg-accent"
      )}
    >
      <TokenOnChainGlyph token={token} chain={chain} size={30} />
      <span className="text-left">
        <span className="block text-sm font-semibold leading-tight">
          {token.symbol}
        </span>
        <span className="text-muted-foreground block text-[11px] leading-tight">
          {chain.name}
        </span>
      </span>
      {locked ? (
        <Lock className="text-muted-foreground size-3.5" />
      ) : (
        <ChevronDown className="text-muted-foreground size-4" />
      )}
    </button>
  );
}

export default function SendPage() {
  const router = useRouter();
  const { recordSend, tokenById, tokensForChain, cards, contacts, custody } =
    useApp();

  const [step, setStep] = useState<Step>("compose");

  const [fromChainId, setFromChainId] = useState("base");
  const [fromTokenId, setFromTokenId] = useState("usdc");
  const [amount, setAmount] = useState("");

  const [dest, setDest] = useState<Destination | null>(null);
  const [toChainId, setToChainId] = useState<string | null>(null);
  const [toTokenId, setToTokenId] = useState<string | null>(null);

  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [destOpen, setDestOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFor, setImportFor] = useState<"from" | "to">("from");

  const [creating, setCreating] = useState(false);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [signing, setSigning] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const fromChain = chainById(fromChainId)!;
  const fromToken = tokenById(fromTokenId)!;
  const toChain = toChainId ? chainById(toChainId) : null;
  const toToken = toTokenId ? tokenById(toTokenId) : null;

  const balance = holdingAmount(fromChainId, fromTokenId);
  const amountNum = Number(amount) || 0;
  const destCard = dest?.kind === "card";

  const fromValid = amountNum > 0;
  const toValid = Boolean(dest && toChainId && toTokenId);

  // Live quote — recomputed every keystroke/selection.
  const quote =
    fromValid && toValid && toChainId && toTokenId
      ? computeQuote({
          fromChainId,
          fromTokenId,
          amount: amountNum,
          toChainId,
          toTokenId,
        })
      : null;

  const sendUsd = amountNum * (fromToken?.usd ?? 1);
  const receiveUsd = quote ? quote.receiveAmount * (toToken?.usd ?? 1) : 0;

  const recipient = dest
    ? dest.kind === "card"
      ? (() => {
          const c = cards.find((x) => x.id === dest.id);
          return {
            label: c?.name ?? "Card",
            sublabel: shortenAddress(c?.address ?? ""),
            icon: (
              <InitialCircle label={c?.name ?? "?"} color={c?.color ?? "#999"} />
            ),
          };
        })()
      : dest.kind === "contact"
        ? (() => {
            const c = contacts.find((x) => x.id === dest.id);
            return {
              label: c?.name ?? "Contact",
              sublabel: c?.handle ?? shortenAddress(c?.address ?? ""),
              icon: (
                <GradientAvatar seed={c?.address ?? dest.id} label={c?.name} />
              ),
            };
          })()
        : {
            label: shortenAddress(dest.address),
            sublabel: "Wallet address",
            icon: <GradientAvatar seed={dest.address} />,
          }
    : null;

  const pickFromChain = (id: string) => {
    setFromChainId(id);
    if (!tokensForChain(id).some((t) => t.id === fromTokenId)) {
      setFromTokenId(tokensForChain(id)[0]?.id ?? "usdc");
    }
  };
  const pickToChain = (id: string) => {
    setToChainId(id);
    if (toTokenId && !tokensForChain(id).some((t) => t.id === toTokenId)) {
      setToTokenId(tokensForChain(id)[0]?.id ?? "usdc");
    }
  };

  const chooseDest = (d: Destination) => {
    setDest(d);
    if (d.kind === "card") {
      const card = cards.find((c) => c.id === d.id)!;
      setToChainId(card.chainId);
      setToTokenId(card.tokenId);
    } else {
      setToChainId((prev) => prev ?? "arbitrum");
      setToTokenId((prev) => prev ?? "usdc");
    }
  };

  const onImported = (tokenId: string, chainId: string) => {
    if (importFor === "from") {
      setFromChainId(chainId);
      setFromTokenId(tokenId);
    } else {
      setToChainId(chainId);
      setToTokenId(tokenId);
    }
  };

  // Confirm -> backend provisions a deposit account to fund.
  const confirmQuote = async () => {
    if (!quote) return;
    setCreating(true);
    const acct = await createDepositAccount({ fromChainId });
    setDepositAddress(acct.address);
    setCreating(false);
    setStep("deposit");
  };

  const finalize = async () => {
    if (!quote || !dest || !toChainId || !toTokenId || !recipient) return;
    const r = await executeSend(quote);
    setReceipt(r);
    recordSend({
      id: r.id,
      date: r.date,
      fromChainId,
      fromTokenId,
      toLabel: recipient.label,
      toChainId,
      toTokenId,
      sendAmount: amountNum,
      receiveAmount: quote.receiveAmount,
      feeUsd: r.feeUsd,
      status: "confirmed",
      route: r.route,
    });
    setStep("success");
  };

  const startChecking = async () => {
    setStep("checking");
    await sleep(2200);
    setStep("compliance");
    await sleep(1900);
    if (custody === "self") setStep("sign");
    else await finalize();
  };

  const signAndFinish = async () => {
    setSigning(true);
    await sleep(1600);
    await finalize();
    setSigning(false);
  };

  const copyAddress = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const importFooter = (side: "from" | "to") => (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => {
        setPicker(null);
        setImportFor(side);
        setImportOpen(true);
      }}
    >
      <Plus className="size-4" />
      Import token by address
    </Button>
  );

  const composeCta = creating
    ? "Preparing transfer…"
    : !fromValid
      ? "Enter an amount"
      : !dest
        ? "Choose a recipient"
        : "Continue";

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
          {step === "deposit" || step === "sign" ? (
            <header className="border-border/60 flex items-center gap-3 border-b px-4 py-4">
          {step === "deposit" ? (
            <button
              type="button"
              onClick={() => setStep("compose")}
              className="hover:bg-accent -ml-2 rounded-lg p-2"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : null}
          <h1 className="flex-1 text-base font-semibold">
            {step === "deposit" ? "Deposit" : "Approve transfer"}
          </h1>
        </header>
      ) : null}

      {/* ───────── compose (send + receive on one screen) ───────── */}
      {step === "compose" ? (
        <div className="animate-step-in space-y-1 p-4">
          {/* one connected bridge panel — the two fields share a seam, no gap */}
          <div className="border-border bg-muted/30 relative rounded-2xl border">
            {/* you send */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">You send</span>
                <button
                  type="button"
                  onClick={() => setAmount(String(balance))}
                  className="text-muted-foreground text-xs"
                >
                  Balance {formatAmount(balance)}{" "}
                  <span className="text-primary font-semibold">MAX</span>
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  inputMode="decimal"
                  autoFocus
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0"
                  className="placeholder:text-muted-foreground/40 w-full min-w-0 bg-transparent text-3xl font-semibold tracking-tight tabular-nums outline-none"
                />
                <AssetSelect
                  token={fromToken}
                  chain={fromChain}
                  onClick={() => setPicker("from")}
                />
              </div>
              {sendUsd > 0 ? (
                <div className="text-muted-foreground mt-1.5 text-sm">
                  ≈ {formatUsd(sendUsd)}
                </div>
              ) : null}
            </div>

            {/* seam + swap indicator */}
            <div className="border-border relative border-t">
              <span className="bg-card border-border text-muted-foreground absolute left-1/2 top-0 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border">
                <ArrowLeft className="size-3.5 -rotate-90" />
              </span>
            </div>

            {/* they receive */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  They receive
                </span>
                {receiveUsd > 0 ? (
                  <span className="text-muted-foreground text-xs">
                    ≈ {formatUsd(receiveUsd)}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setDestOpen(true)}
                className="hover:bg-accent/60 -mx-1.5 mt-2 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors"
              >
                {recipient ? (
                  recipient.icon
                ) : (
                  <span className="bg-muted flex size-8 items-center justify-center rounded-full">
                    <Plus className="text-muted-foreground size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
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

              <div className="mt-2 flex items-center gap-3">
                <span
                  className={cn(
                    "w-full min-w-0 text-3xl font-semibold tracking-tight tabular-nums",
                    quote ? "" : "text-muted-foreground/40"
                  )}
                >
                  {quote ? formatAmount(quote.receiveAmount) : "0"}
                </span>
                {toToken && toChain ? (
                  <AssetSelect
                    token={toToken}
                    chain={toChain}
                    onClick={() => setPicker("to")}
                    locked={destCard}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* live route + fees — revealed once amount + recipient are set */}
          {quote ? (
            <div className="animate-step-in border-border mt-1 space-y-2.5 rounded-2xl border px-4 py-3.5 text-sm">
              <Row label="Route">
                <RouteTrail route={quote.route} className="justify-end" />
              </Row>
              <Row label="Fee">{formatUsd(quote.feeUsd)}</Row>
              <Row label="Network gas">
                <span className="text-brand font-medium">Covered</span>
              </Row>
              <Row label="Privacy">
                <span className="text-brand font-medium">Confidential</span>
              </Row>
              <Row label="Recipient">
                <span className="text-muted-foreground">
                  Screened · {quote.complianceScore}/100
                </span>
              </Row>
            </div>
          ) : null}

          <Button
            size="lg"
            className="mt-3 h-12 w-full text-base"
            disabled={!quote || creating}
            onClick={confirmQuote}
          >
            {composeCta}
          </Button>
        </div>
      ) : null}

      {/* ───────── deposit ───────── */}
      {step === "deposit" ? (
        <div className="space-y-5 p-4">
          <div className="border-border bg-muted/30 space-y-1 rounded-2xl border p-4">
            <p className="text-muted-foreground text-sm">Deposit to complete</p>
            <p className="text-sm leading-relaxed">
              Send{" "}
              <span className="font-medium">
                {formatAmount(amountNum, fromToken.symbol)}
              </span>{" "}
              on {fromChain.name} to the address below. We&apos;ll route it
              privately to {recipient ? recipient.label : "the recipient"}.
            </p>
          </div>

          {depositAddress ? (
            <div className="flex justify-center">
              <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                <QRCodeSVG
                  value={depositAddress}
                  size={168}
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                  marginSize={0}
                  level="M"
                />
              </div>
            </div>
          ) : null}

          <div className="border-border rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                Deposit address · {fromChain.name}
              </p>
              <button
                type="button"
                onClick={copyAddress}
                className="text-primary flex items-center gap-1 text-xs font-medium"
              >
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

          <div className="space-y-3">
            <Button
              size="lg"
              className="h-12 w-full text-base"
              onClick={startChecking}
            >
              <Wallet className="size-5" />
              Connect wallet &amp; deposit
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full text-base"
              onClick={startChecking}
            >
              I&apos;ve deposited
            </Button>
          </div>
        </div>
      ) : null}

      {/* ───────── checking ───────── */}
      {step === "checking" ? (
        <div className="flex min-h-[380px] flex-col items-center justify-center p-6 text-center">
          <Loader2 className="text-primary size-10 animate-spin" />
          <p className="mt-6 text-base font-medium">Checking for your deposit…</p>
          <p className="text-muted-foreground mt-1 max-w-xs text-sm">
            This can take a moment after your transfer confirms. Keep this screen
            open.
          </p>
        </div>
      ) : null}

      {/* ───────── compliance ───────── */}
      {step === "compliance" ? (
        <div className="flex min-h-[380px] flex-col items-center justify-center p-6 text-center">
          <div className="relative flex items-center justify-center">
            <Loader2 className="text-primary size-10 animate-spin" />
            <BadgeCheck className="text-primary absolute size-4" />
          </div>
          <p className="mt-6 text-base font-medium">Running compliance check…</p>
          <p className="text-muted-foreground mt-1 max-w-xs text-sm">
            Screening your deposit for sanctions and risk before we route it
            privately.
          </p>
        </div>
      ) : null}

      {/* ───────── sign (self-custody) ───────── */}
      {step === "sign" ? (
        <div className="space-y-5 p-4">
          <div className="border-brand/30 bg-brand/5 rounded-2xl border p-4">
            <p className="text-sm leading-relaxed">
              <span className="font-medium">Deposit received.</span> Approve the
              intermediary accounts we created to route your transfer — nothing
              moves without your signature.
            </p>
          </div>

          <div className="border-border divide-border divide-y rounded-2xl border">
            {["Authorize route account", "Authorize settlement account"].map(
              (label) => (
                <div key={label} className="flex items-center gap-3 p-4">
                  <span className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg">
                    <ShieldCheck className="size-4" />
                  </span>
                  <p className="flex-1 text-sm font-medium">{label}</p>
                  {signing ? (
                    <Loader2 className="text-muted-foreground size-4 animate-spin" />
                  ) : (
                    <span className="text-muted-foreground text-xs">Pending</span>
                  )}
                </div>
              )
            )}
          </div>

          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={signing}
            onClick={signAndFinish}
          >
            {signing ? "Signing…" : "Sign 2 requests"}
          </Button>
        </div>
      ) : null}

      {/* ───────── success ───────── */}
      {step === "success" && receipt ? (
        <div className="animate-step-in flex min-h-[440px] flex-col items-center p-6">
          <div className="bg-brand/12 text-brand mt-3 flex size-14 items-center justify-center rounded-full">
            <Check className="size-7" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Sent privately</h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {receipt.id}
          </p>

          {/* receipt */}
          <div className="border-border mt-6 w-full overflow-hidden rounded-2xl border text-left text-sm">
            <div className="bg-muted/40 flex items-center gap-3 p-4">
              {toToken && toChain ? (
                <TokenOnChainGlyph token={toToken} chain={toChain} size={38} />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {recipient ? recipient.label : "Recipient"}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  received on {toChain?.name}
                </p>
              </div>
              <p className="shrink-0 text-right font-semibold tabular-nums">
                +{formatAmount(quote?.receiveAmount ?? 0, toToken?.symbol)}
              </p>
            </div>

            <div className="divide-border divide-y">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-muted-foreground">Route</span>
                <RouteTrail route={receipt.route} className="justify-end" />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-muted-foreground">Settled in</span>
                <span className="font-medium">{receipt.time}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-muted-foreground">Network fee</span>
                <span className="font-medium">{formatUsd(receipt.feeUsd)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-muted-foreground">Privacy</span>
                <span className="text-brand font-medium">Confidential</span>
              </div>
            </div>
          </div>

          <Button
            size="lg"
            className="mt-6 h-12 w-full text-base"
            onClick={() => router.push("/activity")}
          >
            Done
          </Button>
        </div>
      ) : null}
        </div>
      </div>

      {/* pickers — one combined token+chain sheet per side */}
      <AssetPicker
        open={picker === "from"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="You send"
        searchPlaceholder="Search token"
        chains={CHAINS.map((c) => ({
          id: c.id,
          label: c.short,
          icon: <NetworkGlyph chain={c} size={16} />,
        }))}
        activeChainId={fromChainId}
        onChainSelect={pickFromChain}
        items={tokensForChain(fromChainId).map((t) => ({
          id: t.id,
          label: t.symbol,
          sublabel: t.name,
          icon: <TokenGlyph token={t} size={28} />,
          right: formatAmount(holdingAmount(fromChainId, t.id)),
        }))}
        onSelect={setFromTokenId}
        footer={importFooter("from")}
      />
      <AssetPicker
        open={picker === "to"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="They receive"
        searchPlaceholder="Search token"
        chains={CHAINS.map((c) => ({
          id: c.id,
          label: c.short,
          icon: <NetworkGlyph chain={c} size={16} />,
        }))}
        activeChainId={toChainId ?? undefined}
        onChainSelect={pickToChain}
        items={tokensForChain(toChainId ?? "ethereum").map((t) => ({
          id: t.id,
          label: t.symbol,
          sublabel: t.name,
          icon: <TokenGlyph token={t} size={28} />,
        }))}
        onSelect={(id) => setToTokenId(id)}
        footer={importFooter("to")}
      />
      <DestinationDialog
        open={destOpen}
        onOpenChange={setDestOpen}
        onSelect={chooseDest}
      />
      <ImportTokenDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onImported}
      />
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
