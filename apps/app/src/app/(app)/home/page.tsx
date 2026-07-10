"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Home is temporarily disabled — send is the landing screen for now.
// This route forwards to /send. The full implementation is preserved below.
export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/send");
  }, [router]);
  return null;
}

/* ===================== ORIGINAL HOME SCREEN (kept for later) =====================
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, ShieldCheck } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";

import { ActivityRow } from "@/components/activity-row";
import { GradientAvatar, TokenOnChainGlyph } from "@/components/crypto-icon";
import { formatAmount, formatUsd } from "@/lib/format";
import { HOLDINGS, chainById } from "@/lib/mock-data";
import { useApp } from "@/lib/store";

export default function HomePage() {
  const router = useRouter();
  const { user, activity, tokenById } = useApp();

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const recent = activity.slice(0, 2);
  const totalUsd = HOLDINGS.reduce((sum, h) => {
    const token = tokenById(h.tokenId);
    return sum + (token ? h.amount * token.usd : 0);
  }, 0);
  const chainCount = new Set(HOLDINGS.map((h) => h.chainId)).size;

  return (
    <div className="pb-2">
      <header className="flex items-center justify-between px-5 pb-2 pt-6">
        <div className="flex items-center gap-3">
          <GradientAvatar
            seed={user?.email ?? "wall8"}
            label={user?.name}
            size={36}
          />
          <div>
            <p className="text-muted-foreground text-xs">Welcome back</p>
            <p className="text-sm font-medium">{firstName}</p>
          </div>
        </div>
        <span className="text-brand flex items-center gap-1 text-xs font-medium">
          <ShieldCheck className="size-3.5" />
          Private
        </span>
      </header>

      <section className="px-5 pt-8">
        <p className="text-muted-foreground text-sm">Private balance</p>
        <p className="mt-1 text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums">
          {formatUsd(totalUsd)}
        </p>
        <p className="text-muted-foreground mt-2.5 text-xs">
          Across {chainCount} chains · fully confidential
        </p>
      </section>

      <section className="px-5 pt-6">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          onClick={() => router.push("/send")}
        >
          <Send className="size-5" />
          Send privately
        </Button>
      </section>

      <section className="px-5 pt-8">
        <h2 className="text-muted-foreground mb-2 px-1 text-xs font-medium uppercase tracking-wide">
          Assets
        </h2>
        <div className="border-border divide-border divide-y rounded-2xl border">
          {HOLDINGS.map((h) => {
            const token = tokenById(h.tokenId);
            const chain = chainById(h.chainId);
            if (!token || !chain) return null;
            return (
              <div
                key={`${h.chainId}-${h.tokenId}`}
                className="flex items-center gap-3 p-4"
              >
                <TokenOnChainGlyph token={token} chain={chain} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{token.symbol}</p>
                  <p className="text-muted-foreground text-xs">{chain.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">
                    {formatAmount(h.amount)}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatUsd(h.amount * token.usd)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground px-1 text-xs font-medium uppercase tracking-wide">
            Recent
          </h2>
          <Link
            href="/activity"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            See all
          </Link>
        </div>
        <div className="divide-border mt-1 divide-y">
          {recent.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No transfers yet.
            </p>
          ) : (
            recent.map((item) => <ActivityRow key={item.id} item={item} />)
          )}
        </div>
      </section>
    </div>
  );
}
================================================================================ */
