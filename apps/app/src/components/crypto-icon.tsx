"use client";

import { NetworkIcon, TokenIcon } from "@web3icons/react/dynamic";

import { cn } from "@erebuz/ui/lib/utils";

import { chainById, type Chain, type Token } from "@/lib/mock-data";

function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

/** Colored circle with initials — used as the fallback for unknown assets. */
export function InitialCircle({
  label,
  color,
  size = 32,
  className,
}: {
  label: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        backgroundColor: color,
      }}
      aria-hidden
    >
      {initialsOf(label)}
    </span>
  );
}

/** Real token logo via web3icons; falls back to a colored initials circle. */
export function TokenGlyph({
  token,
  size = 32,
  className,
}: {
  token: Token;
  size?: number;
  className?: string;
}) {
  const fallback = (
    <InitialCircle label={token.symbol} color={token.color} size={size} />
  );
  const network = chainById(token.chains[0])?.web3Network;

  if (token.custom && token.address && network) {
    return (
      <TokenIcon
        address={token.address}
        network={network}
        variant="branded"
        size={size}
        className={className}
        fallback={fallback}
      />
    );
  }
  return (
    <TokenIcon
      symbol={token.symbol}
      variant="branded"
      size={size}
      className={className}
      fallback={fallback}
    />
  );
}

/** Real network logo via web3icons; falls back to a colored initials circle. */
export function NetworkGlyph({
  chain,
  size = 32,
  className,
}: {
  chain: Chain;
  size?: number;
  className?: string;
}) {
  return (
    <NetworkIcon
      id={chain.web3Network}
      variant="branded"
      size={size}
      className={className}
      fallback={<InitialCircle label={chain.short} color={chain.color} size={size} />}
    />
  );
}

/** Token logo with a small network badge in the corner. */
export function TokenOnChainGlyph({
  token,
  chain,
  size = 40,
}: {
  token: Token;
  chain: Chain;
  size?: number;
}) {
  const badge = Math.round(size * 0.44);
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      <TokenGlyph token={token} size={size} />
      <span
        className="ring-background absolute -bottom-0.5 -right-0.5 inline-flex overflow-hidden rounded-full ring-2"
        style={{ width: badge, height: badge }}
      >
        <NetworkGlyph chain={chain} size={badge} />
      </span>
    </span>
  );
}

/** Deterministic conic-gradient avatar (for accounts / contacts). */
export function GradientAvatar({
  seed,
  size = 32,
  className,
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const bg = `conic-gradient(from 30deg, hsl(${h} 85% 60%), hsl(${(h + 120) % 360} 85% 55%), hsl(${(h + 240) % 360} 85% 60%), hsl(${h} 85% 60%))`;
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    />
  );
}
