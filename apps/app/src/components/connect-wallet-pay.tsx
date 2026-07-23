"use client";

// "Connect wallet & pay" — the alternative to copying the deposit address. Connects
// the user's wallet (RainbowKit, themed to match the app), switches it to the source
// chain if needed, and sends an ERC-20 transfer of the exact deposit amount to the
// route's deposit address. Once it lands, the deposit monitor picks it up exactly
// like a manual send.

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi, getAddress, parseUnits } from "viem";
import { Check, Loader2, Wallet } from "lucide-react";

import { glassSurfaceVariants } from "@erebuz/ui/components/glass-surface";
import { cn } from "@erebuz/ui/lib/utils";

const BTN = cn(
  glassSurfaceVariants({ tone: "ink", depth: "raised", blur: "sm", interactive: true }),
  "press flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold",
);

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
  const { chainId: walletChainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync, isPending: signing } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId });

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
        args: [getAddress(to), parseUnits(amount, 6)],
      });
      setHash(h);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string })?.shortMessage;
      setError(msg && !/user rejected/i.test(msg) ? msg : /user rejected/i.test(msg ?? "") ? "Cancelled in wallet." : "Payment failed. Try again.");
    }
  };

  if (isSuccess) {
    return (
      <div className="border-brand/25 bg-brand/10 text-brand flex items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-semibold">
        <Check className="size-4" /> Payment sent — watching for it…
      </div>
    );
  }

  if (!isConnected) {
    return (
      <ConnectButton.Custom>
        {({ openConnectModal, mounted }) => (
          <button type="button" disabled={!mounted} onClick={openConnectModal} className={BTN}>
            <Wallet className="size-4" /> Connect wallet
          </button>
        )}
      </ConnectButton.Custom>
    );
  }

  const busy = switching || signing || confirming;
  const label = switching
    ? `Switch to ${chainName}…`
    : signing
      ? "Confirm in wallet…"
      : confirming
        ? "Confirming…"
        : `Pay ${amount} ${symbol}`;

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={pay}
        disabled={busy || !token}
        className="press bg-brand text-brand-foreground flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold shadow-lg shadow-brand/25 disabled:cursor-default disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
        {label}
      </button>
      {error ? <p className="text-destructive text-center text-xs">{error}</p> : null}
      <ConnectButton.Custom>
        {({ account, openAccountModal }) => (
          <button
            type="button"
            onClick={openAccountModal}
            className="text-muted-foreground hover:text-foreground mx-auto block cursor-pointer text-center text-xs"
          >
            {account?.displayName ?? "Wallet"} · change
          </button>
        )}
      </ConnectButton.Custom>
    </div>
  );
}
