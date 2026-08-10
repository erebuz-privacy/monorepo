"use client";

// "Connect wallet & pay" — the alternative to copying the deposit address. Connects
// the user's wallet (RainbowKit, themed to match the app), checks the balance on the
// source chain, switches network if needed, and sends an ERC-20 transfer of the
// exact deposit amount to the route's deposit address. Once it lands, the deposit
// monitor picks it up exactly like a manual send.

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi, formatUnits, getAddress, parseUnits } from "viem";
import { AlertTriangle, Check, ChevronRight, Loader2, Wallet } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

import { GradientAvatar } from "@/components/crypto-icon";

const GLASS_BTN = cn(
  "border border-border bg-card shadow-sm transition-colors hover:bg-muted/40",
  "press flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold",
);
const BRAND_BTN =
  "press bg-brand text-brand-foreground flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold shadow-lg shadow-brand/25 transition-[transform,opacity] disabled:cursor-default disabled:opacity-55";

function fmt(v: bigint) {
  const n = Number(formatUnits(v, 6));
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Connected-wallet chip: identicon + address; tap to open the account modal. */
function WalletChip() {
  return (
    <ConnectButton.Custom>
      {({ account, openAccountModal }) =>
        account ? (
          <button
            type="button"
            onClick={openAccountModal}
            className="press border-border/60 bg-muted/30 hover:bg-muted/50 flex w-full cursor-pointer items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors"
          >
            <GradientAvatar seed={account.address} size={28} />
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-sm font-semibold">{account.displayName}</span>
              <span className="text-muted-foreground block text-xs">Connected · tap to change</span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </button>
        ) : (
          <span />
        )
      }
    </ConnectButton.Custom>
  );
}

export function ConnectWalletPay({
  chainId,
  chainName,
  token,
  to,
  amount,
  symbol,
}: {
  chainId: number;
  chainName: string;
  token?: string;
  to: string;
  amount: string;
  symbol: string;
}) {
  const { address, chainId: walletChainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync, isPending: signing } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId });

  let need = BigInt(0);
  try {
    need = parseUnits(amount, 6);
  } catch {
    /* bad amount — leave 0 */
  }

  const { data: balance } = useReadContract({
    chainId,
    address: token ? getAddress(token) : undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(token && address && isConnected), refetchInterval: 8000 },
  });

  const wrongNetwork = isConnected && walletChainId !== chainId;
  const insufficient = balance != null && balance < need;

  const switchNet = async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId });
    } catch {
      setError(`Couldn't switch to ${chainName}. Do it in your wallet, then retry.`);
    }
  };

  const pay = async () => {
    if (!token) return;
    setError(null);
    try {
      if (walletChainId !== chainId) await switchChainAsync({ chainId });
      const h = await writeContractAsync({
        chainId,
        address: getAddress(token),
        abi: erc20Abi,
        functionName: "transfer",
        args: [getAddress(to), need],
      });
      setHash(h);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string })?.shortMessage ?? "";
      setError(/user rejected|denied/i.test(msg) ? "Cancelled in your wallet." : msg || "Payment failed. Try again.");
    }
  };

  // ---- success ----
  if (isSuccess) {
    return (
      <div className="border-brand/25 bg-brand/10 flex items-center gap-3 rounded-2xl border p-4">
        <span className="bg-brand/15 text-brand flex size-9 shrink-0 items-center justify-center rounded-full">
          <Check className="size-5" />
        </span>
        <div>
          <p className="text-foreground text-sm font-semibold">Payment sent</p>
          <p className="text-muted-foreground text-xs">Watching for it on {chainName}…</p>
        </div>
      </div>
    );
  }

  // ---- not connected ----
  if (!isConnected) {
    return (
      <div className="space-y-2.5">
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <button type="button" disabled={!mounted} onClick={openConnectModal} className={GLASS_BTN}>
              <Wallet className="size-4" /> Connect wallet
            </button>
          )}
        </ConnectButton.Custom>
        <p className="text-muted-foreground text-center text-xs">
          Pay the {amount} {symbol} straight from your wallet — no copy-paste.
        </p>
      </div>
    );
  }

  const busy = switching || signing || confirming;

  return (
    <div className="space-y-3">
      <WalletChip />

      {/* balance / amount summary */}
      <div className="border-border/60 flex items-center justify-between rounded-2xl border px-4 py-3 text-sm">
        <span className="text-muted-foreground">Your {symbol} on {chainName}</span>
        <span className={cn("font-semibold tabular-nums", insufficient ? "text-destructive" : "text-foreground")}>
          {balance == null ? "…" : `${fmt(balance)} ${symbol}`}
        </span>
      </div>

      {wrongNetwork ? (
        <>
          <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-600 ring-1 ring-amber-500/20 ring-inset dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" /> Your wallet is on the wrong network.
          </div>
          <button type="button" onClick={switchNet} disabled={switching} className={BRAND_BTN}>
            {switching ? <Loader2 className="size-4 animate-spin" /> : null}
            {switching ? `Switching…` : `Switch to ${chainName}`}
          </button>
        </>
      ) : (
        <button type="button" onClick={pay} disabled={busy || !token || insufficient} className={BRAND_BTN}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
          {signing ? "Confirm in wallet…" : confirming ? "Confirming…" : insufficient ? `Not enough ${symbol}` : `Pay ${amount} ${symbol}`}
        </button>
      )}

      {error ? <p className="text-destructive text-center text-xs">{error}</p> : null}
    </div>
  );
}
