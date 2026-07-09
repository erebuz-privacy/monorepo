"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Fuel,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Badge } from "@erebuz/ui/components/badge";
import { Button } from "@erebuz/ui/components/button";
import { Separator } from "@erebuz/ui/components/separator";
import { Skeleton } from "@erebuz/ui/components/skeleton";

import { AssetPicker } from "@/components/asset-picker";
import {
  GradientAvatar,
  InitialCircle,
  NetworkGlyph,
  TokenGlyph,
} from "@/components/crypto-icon";
import {
  DestinationDialog,
  type Destination,
} from "@/components/destination-dialog";
import { ImportTokenDialog } from "@/components/import-token-dialog";
import { SelectorRow } from "@/components/selector-row";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import { CHAINS, HOLDINGS, chainById } from "@/lib/mock-data";
import {
  createDepositAccount,
  executeSend,
  quoteRoute,
  type Quote,
  type Receipt,
} from "@/lib/mock-sdk";
import { useApp } from "@/lib/store";

type Step =
  | "from"
  | "to"
  | "review"
  | "deposit"
  | "checking"
  | "compliance"
  | "sign"
  | "success";
type PickerKind = "fromChain" | "fromToken" | "toChain" | "toToken";

const TITLES: Record<Step, string> = {
  from: "You send",
  to: "Recipient",
  review: "Review",
  deposit: "Deposit",
  checking: "Checking deposit",
  compliance: "Compliance check",
  sign: "Approve",
  success: "",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function holdingAmount(chainId: string, tokenId: string): number {
  return (
    HOLDINGS.find((h) => h.chainId === chainId && h.tokenId === tokenId)
      ?.amount ?? 0
  );
}

export default function SendPage() {
  const router = useRouter();
  const { recordSend, tokenById, tokensForChain, cards, contacts, custody } =
    useApp();

  const [step, setStep] = useState<Step>("from");

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

  const [quote, setQuote] = useState<Quote | null>(null);
  const [showRoute, setShowRoute] = useState(false);
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

  const recipientView = (
    d: Destination
  ): { label: string; sublabel: string; icon: React.ReactNode } => {
    if (d.kind === "card") {
      const c = cards.find((x) => x.id === d.id);
      return {
        label: c?.name ?? "Card",
        sublabel: shortenAddress(c?.address ?? ""),
        icon: <InitialCircle label={c?.name ?? "?"} color={c?.color ?? "#999"} />,
      };
    }
    if (d.kind === "contact") {
      const c = contacts.find((x) => x.id === d.id);
      return {
        label: c?.name ?? "Contact",
        sublabel: c?.handle ?? shortenAddress(c?.address ?? ""),
        icon: <GradientAvatar seed={c?.address ?? d.id} />,
      };
    }
    return {
      label: shortenAddress(d.address),
      sublabel: "Wallet address",
      icon: <GradientAvatar seed={d.address} />,
    };
  };

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

  const loadQuote = useCallback(async () => {
    if (!toChainId || !toTokenId) return;
    setQuote(null);
    const q = await quoteRoute({
      fromChainId,
      fromTokenId,
      amount: amountNum,
      toChainId,
      toTokenId,
    });
    setQuote(q);
  }, [fromChainId, fromTokenId, amountNum, toChainId, toTokenId]);

  const goReview = () => {
    setStep("review");
    void loadQuote();
  };

  // Confirm the quote -> backend provisions a deposit account for the user.
  const confirmQuote = async () => {
    if (!quote) return;
    setCreating(true);
    const acct = await createDepositAccount({ fromChainId });
    setDepositAddress(acct.address);
    setCreating(false);
    setStep("deposit");
  };

  const finalize = async () => {
    if (!quote || !dest || !toChainId || !toTokenId) return;
    const r = await executeSend(quote);
    setReceipt(r);
    recordSend({
      id: r.id,
      date: r.date,
      fromChainId,
      fromTokenId,
      toLabel: recipientView(dest).label,
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

  // User indicates they've funded the deposit address -> detect it, then screen
  // the deposited funds for compliance before routing.
  const startChecking = async () => {
    setStep("checking");
    await sleep(2200);
    setStep("compliance");
    await sleep(1900);
    if (custody === "self") setStep("sign");
    else await finalize();
  };

  // Self-custody only: sign for the intermediary accounts, then settle.
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

  const canBack = step === "to" || step === "review" || step === "deposit";
  const back = () => {
    if (step === "to") setStep("from");
    else if (step === "review") {
      setQuote(null);
      setStep("to");
    } else if (step === "deposit") setStep("review");
  };

  const stepIndex = step === "from" ? 1 : step === "to" ? 2 : 3;
  const showIndex = step === "from" || step === "to" || step === "review";

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

  return (
    <div className="flex flex-col">
      {step !== "success" ? (
        <div className="border-border/60 border-b">
          <header className="flex items-center gap-3 px-4 pb-3 pt-4">
            {canBack ? (
              <button
                type="button"
                onClick={back}
                className="hover:bg-accent -ml-2 rounded-lg p-2"
                aria-label="Back"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : (
              <span className="w-1" />
            )}
            <h1 className="flex-1 text-base font-semibold">{TITLES[step]}</h1>
          </header>
          {showIndex ? (
            <div className="flex gap-1.5 px-4 pb-4">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    n <= stepIndex ? "bg-foreground" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div key={step} className="animate-step-in flex-1 px-5 pb-6 pt-6">
        {step === "from" ? (
          <div className="space-y-4">
            <div className="border-border rounded-xl border p-4">
              <div className="flex items-baseline justify-between">
                <label className="text-muted-foreground text-xs">Amount</label>
                <span className="text-muted-foreground text-xs">
                  Balance: {formatAmount(balance, fromToken.symbol)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input
                  inputMode="decimal"
                  autoFocus
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0"
                  className="placeholder:text-muted-foreground/40 w-full bg-transparent text-4xl font-semibold tracking-tight tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(balance))}
                  className="text-primary shrink-0 text-xs font-semibold"
                >
                  MAX
                </button>
              </div>
            </div>

            <SelectorRow
              label="Token"
              value={fromToken.symbol}
              sublabel={fromToken.name}
              icon={<TokenGlyph token={fromToken} />}
              onClick={() => setPicker("fromToken")}
            />
            <SelectorRow
              label="From chain"
              value={fromChain.name}
              icon={<NetworkGlyph chain={fromChain} />}
              onClick={() => setPicker("fromChain")}
            />

            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={!fromValid}
              onClick={() => setStep("to")}
            >
              Continue
              <ArrowRight className="size-5" />
            </Button>
          </div>
        ) : null}

        {step === "to" ? (
          <div className="space-y-4">
            <SelectorRow
              label="Send to"
              value={dest ? recipientView(dest).label : undefined}
              sublabel={dest ? recipientView(dest).sublabel : undefined}
              icon={dest ? recipientView(dest).icon : undefined}
              placeholder="Choose recipient"
              onClick={() => setDestOpen(true)}
            />

            {dest ? (
              <div className="space-y-4">
                <p className="text-muted-foreground px-1 text-xs">
                  They receive
                </p>
                {destCard && toToken && toChain ? (
                  <div className="border-border flex items-center gap-3 rounded-xl border p-3">
                    <TokenGlyph token={toToken} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {toToken.symbol} on {toChain.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Set by the card
                      </p>
                    </div>
                    <Lock className="text-muted-foreground size-4" />
                  </div>
                ) : (
                  <>
                    <SelectorRow
                      label="Receive token"
                      value={toToken?.symbol}
                      sublabel={toToken?.name}
                      icon={toToken ? <TokenGlyph token={toToken} /> : undefined}
                      onClick={() => setPicker("toToken")}
                    />
                    <SelectorRow
                      label="Receive on chain"
                      value={toChain?.name}
                      icon={toChain ? <NetworkGlyph chain={toChain} /> : undefined}
                      onClick={() => setPicker("toChain")}
                    />
                  </>
                )}
              </div>
            ) : null}

            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={!toValid}
              onClick={goReview}
            >
              Review
              <ArrowRight className="size-5" />
            </Button>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-5">
            <div className="border-border rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <TokenGlyph token={fromToken} />
                <div className="flex-1">
                  <p className="text-muted-foreground text-xs">You send</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatAmount(amountNum, fromToken.symbol)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    on {fromChain.name}
                  </p>
                </div>
              </div>

              <div className="my-2 flex justify-center">
                <span className="bg-muted flex size-7 items-center justify-center rounded-full">
                  <ArrowDown className="text-muted-foreground size-4" />
                </span>
              </div>

              <div className="flex items-center gap-3">
                {toToken ? <TokenGlyph token={toToken} /> : null}
                <div className="flex-1">
                  <p className="text-muted-foreground text-xs">
                    {dest ? recipientView(dest).label : ""} receives
                  </p>
                  {quote ? (
                    <p className="text-lg font-semibold tabular-nums">
                      ≈ {formatAmount(quote.receiveAmount, toToken?.symbol)}
                    </p>
                  ) : (
                    <Skeleton className="mt-1 h-6 w-32" />
                  )}
                  <p className="text-muted-foreground text-xs">
                    on {toChain?.name}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <Row label="Fee">
                {quote ? (
                  formatUsd(quote.feeUsd)
                ) : (
                  <Skeleton className="h-4 w-14" />
                )}
              </Row>
              <Row
                label={
                  <span className="flex items-center gap-1.5">
                    <Fuel className="text-muted-foreground size-4" /> Network gas
                  </span>
                }
              >
                <Badge variant="success">Covered</Badge>
              </Row>
              <Row
                label={
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="text-muted-foreground size-4" />{" "}
                    Privacy
                  </span>
                }
              >
                <Badge variant="success">Confidential</Badge>
              </Row>
              <Row
                label={
                  <span className="flex items-center gap-1.5">
                    <BadgeCheck className="text-muted-foreground size-4" />
                    Recipient screened
                  </span>
                }
              >
                {quote ? (
                  <Badge variant="success">
                    Passed · {quote.complianceScore}/100
                  </Badge>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
              </Row>

              <Separator />

              <button
                type="button"
                onClick={() => setShowRoute((s) => !s)}
                className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between text-xs"
              >
                <span>Show routing details</span>
                {showRoute ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
              {showRoute && quote ? (
                <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                  {quote.route.map((hop, i) => (
                    <span key={hop} className="flex items-center gap-1.5">
                      <span className="bg-muted rounded px-1.5 py-0.5">
                        {hop}
                      </span>
                      {i < quote.route.length - 1 ? (
                        <ArrowRight className="size-3" />
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={!quote || creating}
              onClick={confirmQuote}
            >
              {creating
                ? "Creating deposit account…"
                : quote
                  ? "Confirm"
                  : "Getting best route…"}
            </Button>
          </div>
        ) : null}

        {step === "deposit" ? (
          <div className="space-y-5">
            <div className="border-border space-y-1 rounded-xl border p-4">
              <p className="text-muted-foreground text-sm">Deposit to complete</p>
              <p className="text-sm leading-relaxed">
                Send{" "}
                <span className="font-medium">
                  {formatAmount(amountNum, fromToken.symbol)}
                </span>{" "}
                on {fromChain.name} to the address below. We&apos;ll route it
                privately to {dest ? recipientView(dest).label : "the recipient"}.
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

            <div className="border-border rounded-xl border p-4">
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
                Connect wallet & deposit
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

        {step === "checking" ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <Loader2 className="text-primary size-10 animate-spin" />
            <p className="mt-6 text-base font-medium">
              Checking for your deposit…
            </p>
            <p className="text-muted-foreground mt-1 max-w-xs text-sm">
              This can take a moment after your transfer confirms. Keep this
              screen open.
            </p>
          </div>
        ) : null}

        {step === "compliance" ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <div className="relative flex items-center justify-center">
              <Loader2 className="text-primary size-10 animate-spin" />
              <BadgeCheck className="text-primary absolute size-4" />
            </div>
            <p className="mt-6 text-base font-medium">
              Running compliance check…
            </p>
            <p className="text-muted-foreground mt-1 max-w-xs text-sm">
              Screening your deposit for sanctions and risk before we route it
              privately.
            </p>
          </div>
        ) : null}

        {step === "sign" ? (
          <div className="space-y-5">
            <div className="border-border rounded-xl border bg-emerald-500/5 p-4">
              <p className="text-sm leading-relaxed">
                <span className="font-medium">Deposit received.</span> Approve
                the intermediary accounts we created to route your transfer —
                nothing moves without your signature.
              </p>
            </div>

            <div className="border-border divide-border divide-y rounded-xl border">
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
                      <span className="text-muted-foreground text-xs">
                        Pending
                      </span>
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

        {step === "success" && receipt ? (
          <div className="flex min-h-[440px] flex-col items-center justify-center px-1 py-8 text-center">
            <div className="bg-brand/12 text-brand flex size-16 items-center justify-center rounded-full">
              <Check className="size-8" />
            </div>
            <h1 className="mt-5 text-xl font-semibold">Sent privately</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {dest ? recipientView(dest).label : ""} receives ≈{" "}
              {formatAmount(quote?.receiveAmount ?? 0, toToken?.symbol)}
            </p>

            <div className="border-border mt-6 w-full space-y-3 rounded-xl border p-4 text-left text-sm">
              <Row label="Status">
                <Badge variant="success">Confirmed</Badge>
              </Row>
              <Row label="Time">
                <span className="text-muted-foreground">{receipt.time}</span>
              </Row>
              <Row label="Fee">
                <span className="text-muted-foreground">
                  {formatUsd(receipt.feeUsd)}
                </span>
              </Row>
              <Row label="Privacy">
                <Badge variant="success">Confidential</Badge>
              </Row>
              <Row label="Reference">
                <span className="text-muted-foreground text-xs">
                  {receipt.id}
                </span>
              </Row>
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

      {/* pickers */}
      <AssetPicker
        open={picker === "fromChain"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="From chain"
        items={CHAINS.map((c) => ({
          id: c.id,
          label: c.name,
          icon: <NetworkGlyph chain={c} size={28} />,
        }))}
        onSelect={pickFromChain}
      />
      <AssetPicker
        open={picker === "fromToken"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Token"
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
        open={picker === "toChain"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Receive on chain"
        items={CHAINS.map((c) => ({
          id: c.id,
          label: c.name,
          icon: <NetworkGlyph chain={c} size={28} />,
        }))}
        onSelect={pickToChain}
      />
      <AssetPicker
        open={picker === "toToken"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Receive token"
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
