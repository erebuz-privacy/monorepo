"use client";

import { useState } from "react";
import Image from "next/image";
import { NetworkIcon, TokenIcon } from "@web3icons/react/dynamic";
import { ArrowRight, Lock } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

import {
  CHAINS,
  chainById,
  colorFromString,
  type Chain,
  type Token,
} from "@/lib/mock-data";

function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

/** Colored circle with initials - used as the fallback for unknown assets. */
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

/**
 * Logo loaded from a remote URL (Relay provides one for every chain and token),
 * with a colored initials-circle fallback on missing/broken images. Used for the
 * live, all-chains selectors where we don't have a curated web3icons id.
 */
export function RemoteGlyph({
  src,
  label,
  size = 32,
  color,
  className,
}: {
  src?: string | null;
  label: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <InitialCircle
        label={label}
        color={color ?? colorFromString(label)}
        size={size}
        className={className}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("bg-muted object-cover", className)}
      style={{ width: "100%", height: "100%" }}
      aria-hidden
    />
  );
}

// chainId -> web3icons network slug (kebab-case of the Network<Name> icon).
// Testnets excluded — local logos from /public/chains/ via tee.ts.
const WEB3_NETWORK_BY_CHAIN_ID: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  137: "polygon",
  8453: "base",
  42161: "arbitrum-one",
};

/**
 * Chain logo by chainId via web3icons (real brand), falling back to the TEE's
 * remote logo URL, then a colored initials circle. Use for the live TEE-driven
 * selectors so USDC/Base/Ethereum etc. render their real logos.
 */
export function ChainGlyph({
  chainId,
  label,
  logoUrl,
  size = 32,
  className,
}: {
  chainId?: number;
  label: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const network = chainId != null ? WEB3_NETWORK_BY_CHAIN_ID[chainId] : undefined;
  const fallback = <RemoteGlyph src={logoUrl} label={label} size={size} className={className} />;
  if (!network) return fallback;
  return (
    <NetworkIcon
      id={network}
      variant="branded"
      size={size}
      className={cn("shrink-0", className)}
      fallback={fallback}
    />
  );
}

/** Token logo by symbol via web3icons (real brand), falling back to remote URL then initials. */
export function SymbolGlyph({
  symbol,
  logoUrl,
  size = 32,
  className,
}: {
  symbol: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <TokenIcon
      symbol={symbol}
      variant="branded"
      size={size}
      className={cn("shrink-0", className)}
      fallback={<RemoteGlyph src={logoUrl} label={symbol} size={size} className={className} />}
    />
  );
}

/** Token logo + small chain badge, both via web3icons brands (remote/initials fallback). */
export function AssetGlyph({
  symbol,
  tokenLogo,
  chainId,
  chainLabel,
  chainLogo,
  size = 40,
}: {
  symbol: string;
  tokenLogo?: string | null;
  chainId?: number;
  chainLabel: string;
  chainLogo?: string | null;
  size?: number;
}) {
  const badge = Math.round(size * 0.44);
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <SymbolGlyph symbol={symbol} logoUrl={tokenLogo} size={size} />
      <span
        className="ring-background absolute -bottom-0.5 -right-0.5 inline-flex overflow-hidden rounded-full ring-2"
        style={{ width: badge, height: badge }}
      >
        <ChainGlyph chainId={chainId} label={chainLabel} logoUrl={chainLogo} size={badge} />
      </span>
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

/** Seeded PRNG (xorshift) for the blockies identicon, per the classic algo. */
function blockiesRand(seed: string): () => number {
  const s = [0, 0, 0, 0];
  for (let i = 0; i < seed.length; i++) {
    s[i % 4] = (s[i % 4] << 5) - s[i % 4] + seed.charCodeAt(i);
  }
  return () => {
    const t = s[0] ^ (s[0] << 11);
    s[0] = s[1];
    s[1] = s[2];
    s[2] = s[3];
    s[3] = s[3] ^ (s[3] >>> 19) ^ t ^ (t >>> 8);
    return (s[3] >>> 0) / 4294967296;
  };
}

/**
 * Account / contact avatar - a blockies identicon (the Ethereum-standard dapp
 * identicon), deliberately toned to one muted hue so it reads calm, not loud.
 * `label` is accepted for call-site convenience; the pattern derives from `seed`.
 */
export function GradientAvatar({
  seed,
  size = 32,
  className,
}: {
  seed: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  const rand = blockiesRand(seed);
  const hue = Math.floor(rand() * 360);
  const bg = `hsl(${hue} 16% 47%)`;
  const main = `hsl(${hue} 24% 36%)`;
  const spot = `hsl(${hue} 22% 62%)`;

  // Classic blockies: an 8×8 grid mirrored across the vertical axis.
  const GRID = 8;
  const half = Math.ceil(GRID / 2);
  const rows: number[][] = [];
  for (let y = 0; y < GRID; y++) {
    const left: number[] = [];
    for (let x = 0; x < half; x++) {
      const v = rand();
      left.push(v < 0.43 ? 0 : v < 0.78 ? 1 : 2);
    }
    rows.push([...left, ...left.slice(0, GRID - half).reverse()]);
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-full",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 8 8"
        shapeRendering="crispEdges"
      >
        <rect width={8} height={8} fill={bg} />
        {rows.flatMap((row, y) =>
          row.map((v, x) =>
            v ? (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill={v === 1 ? main : spot}
              />
            ) : null
          )
        )}
      </svg>
    </span>
  );
}

/** The STRK20 privacy-pool wordmark, shown as a hop in a route. */
const POOL_HOP = "STRK20 pool";

/** STRK20 brand chip - white/red wordmark on a dark plate (legible either theme). */
function Strk20Chip() {
  return (
    <span className="inline-flex items-center rounded-md bg-neutral-900 px-1.5 py-1">
      <Image
        src="/strk20-logo.png"
        alt="STRK20 pool"
        width={49}
        height={12}
        unoptimized
        className="h-3 w-auto"
      />
    </span>
  );
}

/**
 * Circle CCTP attribution chip. CCTP (Circle's Cross-Chain Transfer Protocol) is
 * the native burn-and-mint bridge that moves USDC into and out of the private
 * pool. We show the protocol name with a green circular glyph (a nod to Circle's
 * brand) rather than Circle's actual logo mark, which Circle's brand policy
 * reserves for authorized use. To swap in an official asset later, replace the
 * glyph <span> with an <Image src="/circle-cctp.svg" />.
 */
export function CctpBadge({
  compact,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400",
        className
      )}
      title="Bridged via Circle CCTP (native USDC burn & mint)"
    >
      <span
        className="inline-block size-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25"
        aria-hidden
      />
      {compact ? "CCTP" : "Circle CCTP"}
    </span>
  );
}

/**
 * The full private-route trail as scannable hops:
 *   source chain → (Circle CCTP) → Railgun private pool → (Circle CCTP) → dest chain
 * Both CCTP bridge legs (in and out) and the privacy hop are made explicit. Shared
 * by the send flow and the shareable /tx view so every surface tells the same story.
 */
export function PrivateRouteTrail({
  fromChainId,
  fromName,
  fromLogo,
  toChainId,
  toName,
  toLogo,
  className,
}: {
  fromChainId?: number;
  fromName: string;
  fromLogo?: string | null;
  toChainId?: number;
  toName: string;
  toLogo?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center justify-center gap-1.5 text-xs",
        className
      )}
    >
      <ChainGlyph chainId={fromChainId} label={fromName} logoUrl={fromLogo} size={14} />
      <span className="text-foreground/80 font-medium">{fromName}</span>
      <CctpBadge compact />
      <span className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium">
        <Lock className="size-3" /> Railgun
      </span>
      <CctpBadge compact />
      <ChainGlyph chainId={toChainId} label={toName} logoUrl={toLogo} size={14} />
      <span className="text-foreground/80 font-medium">{toName}</span>
    </div>
  );
}

/**
 * Renders a transfer route as icon-first hops: chain glyph + name, the STRK20
 * pool as its brand chip, and an arrow glyph (never a text "→") between hops.
 */
export function RouteTrail({
  route,
  className,
}: {
  route: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
      {route.map((hop, i) => {
        const chain = CHAINS.find((c) => c.name === hop);
        return (
          <span key={`${hop}-${i}`} className="flex items-center gap-1.5">
            {hop === POOL_HOP ? (
              <Strk20Chip />
            ) : (
              <span className="flex items-center gap-1.5">
                {chain ? <NetworkGlyph chain={chain} size={15} /> : null}
                <span className="text-foreground font-medium">{hop}</span>
              </span>
            )}
            {i < route.length - 1 ? (
              <ArrowRight className="text-muted-foreground size-3 shrink-0" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
