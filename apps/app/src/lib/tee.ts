// Real TEE client. The TEE (packages/tee) exposes the private-route quote/create
// /status endpoints and Relay chain/token discovery. This replaces the old
// mock-sdk quote path - every value here comes off the wire.

const TEE_URL = (process.env.NEXT_PUBLIC_TEE_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Envelope<T> = { success: boolean; data?: T; error?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${TEE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("Can't reach the service. Check your connection and try again.");
  }
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new Error(`Unexpected response from the service (${res.status}).`);
  }
  if (!res.ok || !body.success || body.data === undefined) {
    throw new Error(body.error || `Request failed (${res.status}).`);
  }
  return body.data;
}

// ---- Discovery (Relay, proxied) --------------------------------------------

export type TeeChain = {
  chainId: number;
  name: string;
  displayName: string;
  logoUrl?: string;
  /** VM family: evm, svm (Solana), tvm (Tron), tonvm, bvm, etc. */
  vmType?: string;
};

export type TeeToken = {
  chainId: number;
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
  logoUrl?: string;
};

// ---- Quote / route ----------------------------------------------------------

export type TeeQuote = {
  /** Source token (sent). */
  symbol: string;
  decimals: number;
  /** Destination token (received) - may differ from the source. */
  destSymbol: string;
  destDecimals: number;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  /** amount is source-token smallest units; fee + output amounts are DEST-token smallest units. */
  amount: string;
  /** Our service fee (margin). */
  feeAmount: string;
  /** CCTP bridge fee borne by the user (dest leg). "0" for Relay routes. */
  bridgeFeeAmount: string;
  /** Railgun privacy (unshield) fee. "0" for Relay routes. */
  privacyFeeAmount: string;
  /** Guaranteed net delivered to the recipient (amount − all fees). */
  quotedOutputAmount: string;
  amountInUsd: number | null;
  quotedOutputUsd: number | null;
  feeUsd: number | null;
  bridgeFeeUsd: number | null;
  privacyFeeUsd: number | null;
  etaSeconds: number;
  route: string[];
};

export type QuoteInput = {
  sourceChainId: number;
  destChainId: number;
  /** Human-readable amount, e.g. "5". */
  amount: string;
  /** Source token symbol. */
  tokenSymbol?: string;
  /** Destination token symbol; defaults to the source symbol (same-asset route). */
  destTokenSymbol?: string;
};

export type CreateRouteInput = QuoteInput & { userDestinationAddress: string };

export type CreatedRoute = {
  routeId: string;
  status: string;
  depositAddress: string;
  hubAccount: string;
  hubIsSmartAccount: boolean;
  requestId: string;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  tokenSymbol: string;
  destTokenSymbol: string;
  amount: string;
  feeAmount: string;
  quotedOutputAmount: string;
};

/** Persisted route as returned by GET /api/private-route/:routeId. */
export type RouteRecord = {
  id: string;
  status: string;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  tokenSymbol: string;
  amount: string;
  feeAmount: string;
  quotedOutputAmount: string;
  userDestinationAddress: string;
  depositAddress?: string | null;
  leg1DepositAddress?: string | null;
  hubAccount?: string | null;
  createdAt?: string | null;
  error?: string | null;
  [key: string]: unknown;
};

const CHAIN_LOGO: Record<number, string> = {
  // testnet
  1301: "/chains/unichain.jpg",
  1328: "/chains/sei.jpg",
  4801: "/chains/world.jpg",
  80002: "/chains/polygon.jpg",
  84532: "/chains/base.jpg",
  421614: "/chains/arbitrum.jpg",
  11155111: "/chains/ethereum.jpg",
  11155420: "/chains/optimism.jpg",
  // mainnet (ready when mainnet TEE goes live)
  1: "/chains/ethereum.jpg",
  10: "/chains/optimism.jpg",
  137: "/chains/polygon.jpg",
  8453: "/chains/base.jpg",
  42161: "/chains/arbitrum.jpg",
};

export const tee = {
  baseUrl: TEE_URL,

  async getChains(): Promise<TeeChain[]> {
    const chains = await request<TeeChain[]>("/api/relay/chains");
    return chains.map((c) => ({
      ...c,
      logoUrl: CHAIN_LOGO[c.chainId] ?? c.logoUrl,
    }));
  },

  getTokens(chainId: number, search?: string): Promise<TeeToken[]> {
    const qs = new URLSearchParams({ chainId: String(chainId) });
    if (search) qs.set("search", search);
    return request<TeeToken[]>(`/api/relay/tokens?${qs.toString()}`);
  },

  quote(input: QuoteInput): Promise<TeeQuote> {
    return request<TeeQuote>("/api/private-route/quote", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  createRoute(input: CreateRouteInput): Promise<CreatedRoute> {
    return request<CreatedRoute>("/api/private-route", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getRoute(routeId: string): Promise<RouteRecord> {
    return request<RouteRecord>(`/api/private-route/${encodeURIComponent(routeId)}`);
  },
};

// ---- Amount helpers (smallest-unit string <-> human number) ----------------

/** Convert a smallest-unit string to a human number for display. */
export function fromSmallestUnit(value: string, decimals: number): number {
  if (!value) return 0;
  const neg = value.startsWith("-");
  const digits = (neg ? value.slice(1) : value).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? `.${digits.slice(digits.length - decimals)}` : "";
  return Number(`${neg ? "-" : ""}${whole}${frac}`);
}
