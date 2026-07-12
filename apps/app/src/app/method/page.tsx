"use client";

// Execution-method screen, shown after the user confirms a quote. Managed
// (TEE-custody, gasless) is enabled and creates the real route; Self-custody is
// disabled for now. This is where sign-in happens for the managed path.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";

import { FullScreenLoader } from "@/components/full-screen-loader";
import { OptionCard } from "@/components/option-card";
import { Screen } from "@/components/screen";
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

  if (!draft) return <FullScreenLoader />;

  const { quote, fromChain, toChain, fromToken, toToken, recipientAddress } = draft;
  const quotedOut = fromSmallestUnit(quote.quotedOutputAmount, quote.destDecimals);
  const sendNum = Number(draft.amount) || 0;

  const startManaged = async () => {
    setError(null);
    setCreating(true);
    try {
      // Mock sign-in for the managed (TEE-custody) path. Real auth wires in later.
      login({ name: "Alex Rivera", email: "alex@wall8.xyz" }, "managed");
      const created = await tee.createRoute({
        sourceChainId: fromChain.chainId,
        destChainId: toChain.chainId,
        amount: draft.amount,
        tokenSymbol: fromToken.symbol,
        destTokenSymbol: toToken.symbol,
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
    <Screen>
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
            to {shortenAddress(recipientAddress)} on {toChain.displayName}
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

      <div className="space-y-3">
        <OptionCard
          icon={ShieldCheck}
          title="Managed"
          badge="Recommended"
          description={
            creating
              ? "Preparing your private transfer…"
              : "Secured in a protected enclave. Gasless, recoverable, easiest."
          }
          onClick={startManaged}
          loading={creating}
        />
        <OptionCard
          icon={KeyRound}
          title="Self-custody"
          badge="Coming soon"
          badgeVariant="outline"
          description="Hold your own keys and sign each step yourself."
          disabled
        />
      </div>

      {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}
    </Screen>
  );
}
