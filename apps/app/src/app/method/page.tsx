"use client";

// Execution-method screen, shown after the user confirms a quote. Managed
// (TEE-custody, gasless) is enabled and creates the real route; Self-custody is
// disabled for now. This is where sign-in happens for the managed path.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";

import { RemoteAssetGlyph } from "@/components/crypto-icon";
import { formatAmount, formatUsd, shortenAddress } from "@/lib/format";
import { useRouteDraft } from "@/lib/route-draft";
import { useApp } from "@/lib/store";
import { fromSmallestUnit, tee } from "@/lib/tee";

export default function MethodPage() {
  const router = useRouter();
  const { draft, patchDraft } = useRouteDraft();
  const { login } = useApp();

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No confirmed quote (direct nav / reload) -> back to the quote screen.
  useEffect(() => {
    if (!draft) router.replace("/");
  }, [draft, router]);

  if (!draft) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const { quote, fromChain, toChain, fromToken, toToken, recipientAddress } = draft;
  const quotedOut = fromSmallestUnit(quote.quotedOutputAmount, quote.destDecimals);
  const sendNum = Number(draft.amount) || 0;

  const startManaged = async () => {
    setError(null);
    setCreating(true);
    try {
      // Mock sign-in for the managed (TEE-custody) path - real auth wires in later.
      login({ name: "Alex Rivera", email: "alex@wall8.xyz" }, "managed");
      const created = await tee.createRoute({
        sourceChainId: fromChain.chainId,
        destChainId: toChain.chainId,
        amount: draft.amount,
        tokenSymbol: fromToken.symbol,
        userDestinationAddress: recipientAddress,
      });
      patchDraft({ created });
      router.push("/transfer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the transfer.");
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="hover:bg-accent -ml-2 mb-4 w-fit rounded-lg p-2"
        aria-label="Back"
        disabled={creating}
      >
        <ArrowLeft className="size-5" />
      </button>

      {/* transfer summary */}
      <div className="border-border bg-muted/30 flex items-center gap-3 rounded-2xl border p-4">
        <RemoteAssetGlyph
          tokenLogo={toToken.logoUrl}
          tokenLabel={quote.destSymbol}
          chainLogo={toChain.logoUrl}
          chainLabel={toChain.displayName}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {formatAmount(sendNum, fromToken.symbol)} on {fromChain.displayName}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            → {shortenAddress(recipientAddress)} on {toChain.displayName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {formatAmount(quotedOut, quote.destSymbol)}
          </p>
          <p className="text-muted-foreground text-xs">
            fee {quote.feeUsd != null ? formatUsd(quote.feeUsd) : "-"}
          </p>
        </div>
      </div>

      <div className="mb-6 mt-8">
        <h1 className="text-2xl font-semibold tracking-tight">How do you want to send?</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Choose how your funds are handled for this transfer.
        </p>
      </div>

      {/* Managed - enabled */}
      <button
        type="button"
        onClick={startManaged}
        disabled={creating}
        className="group border-border bg-card hover:border-primary/60 hover:bg-accent/40 w-full rounded-xl border p-4 text-left transition-colors disabled:opacity-70"
      >
        <div className="flex items-start gap-3">
          <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
            {creating ? <Loader2 className="size-5 animate-spin" /> : <ShieldCheck className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Managed</span>
              <span className="text-brand text-xs font-medium">Recommended</span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
              {creating
                ? "Preparing your private transfer…"
                : "Secured in a protected enclave. Gasless, recoverable, easiest."}
            </p>
          </div>
        </div>
      </button>

      <div className="text-muted-foreground my-4 text-center text-xs uppercase tracking-wide">
        Or bring your own keys
      </div>

      {/* Self-custody - disabled */}
      <div
        aria-disabled
        className="border-border/60 bg-card/40 w-full cursor-not-allowed rounded-xl border p-4 text-left opacity-60"
      >
        <div className="flex items-start gap-3">
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
            <KeyRound className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Self-custody</span>
              <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                Coming soon
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
              Hold your own keys and sign each step yourself.
            </p>
          </div>
        </div>
      </div>

      {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}

      {creating ? (
        <Button size="lg" className="mt-6 h-12 w-full text-base" disabled>
          <Loader2 className="size-5 animate-spin" />
          Creating transfer…
        </Button>
      ) : null}
    </div>
  );
}
