export type Chain = {
  id: string;
  name: string;
  short: string;
  color: string;
  /** network id understood by @web3icons/react */
  web3Network: string;
};

export type Token = {
  id: string;
  symbol: string;
  name: string;
  color: string;
  usd: number;
  /** chains this token is available on */
  chains: string[];
  /** contract address (set for imported tokens) */
  address?: string;
  /** true when the user imported this token by address */
  custom?: boolean;
};

export type Card = {
  id: string;
  name: string;
  /** EVM address funds are deposited to */
  address: string;
  chainId: string;
  tokenId: string;
  color: string;
};

export type Contact = {
  id: string;
  name: string;
  address: string;
  handle?: string;
  color: string;
};

export type TxStatus = "confirmed" | "pending" | "failed";

/**
 * Self-describing display data for a REAL (TEE) transfer. Seed/mock activity
 * resolves its chains/tokens through the mock CHAINS/tokens maps; a live record
 * can't (its chains are numeric TEE chainIds), so it carries everything it needs
 * to render on its own. When present, ActivityRow + the detail view prefer it.
 */
export type ActivityLive = {
  fromChainId: number;
  fromChainName: string;
  fromChainLogo?: string;
  toChainId: number;
  toChainName: string;
  toChainLogo?: string;
  sendSymbol: string;
  sendLogo?: string;
  /** Source-chain token contract address — lets the "connect wallet & pay" flow
   *  build the ERC-20 transfer to the deposit address. */
  sendTokenAddress?: string;
  recvSymbol: string;
  routeId?: string;
  /** Raw TEE route status (AWAITING_DEPOSIT, BRIDGING_IN, …, COMPLETED, FAILED).
   *  Drives the granular in-flight UI; the coarse `Activity.status` drives the pill. */
  stage?: string;
  /** Deposit address to fund (set while the route is awaiting a deposit). */
  depositAddress?: string;
  /** Quoted end-to-end estimate (seconds) — used to flag a slow route. */
  etaSeconds?: number;
  /** ms timestamp when routing actually began (deposit detected, i.e. the stage
   *  first left AWAITING_DEPOSIT). The elapsed timer counts from here, NOT from
   *  intent creation, so the pre-deposit wait isn't counted. */
  startedAt?: number;
};

export type Activity = {
  id: string;
  date: string;
  fromChainId: string;
  fromTokenId: string;
  toLabel: string;
  toChainId: string;
  toTokenId: string;
  sendAmount: number;
  receiveAmount: number;
  feeUsd: number;
  status: TxStatus;
  route: string[];
  /** Set for real transfers routed through the TEE (see ActivityLive). */
  live?: ActivityLive;
};

export const CHAINS: Chain[] = [
  { id: "starknet", name: "StarkNet", short: "STRK", color: "#EC796B", web3Network: "starknet" },
  { id: "ethereum", name: "Ethereum", short: "ETH", color: "#627EEA", web3Network: "ethereum" },
  { id: "arbitrum", name: "Arbitrum", short: "ARB", color: "#12AAFF", web3Network: "arbitrum-one" },
  { id: "base", name: "Base", short: "BASE", color: "#0052FF", web3Network: "base" },
  { id: "polygon", name: "Polygon", short: "POL", color: "#8247E5", web3Network: "polygon" },
];

export const SEED_TOKENS: Token[] = [
  {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    color: "#2775CA",
    usd: 1,
    chains: ["ethereum", "arbitrum", "base", "polygon", "starknet"],
  },
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether",
    color: "#26A17B",
    usd: 1,
    chains: ["ethereum", "arbitrum", "polygon"],
  },
  {
    id: "eth",
    symbol: "ETH",
    name: "Ether",
    color: "#627EEA",
    usd: 3500,
    chains: ["ethereum", "arbitrum", "base"],
  },
  {
    id: "dai",
    symbol: "DAI",
    name: "Dai",
    color: "#F5AC37",
    usd: 1,
    chains: ["ethereum", "polygon"],
  },
];

export const chainById = (id: string) => CHAINS.find((c) => c.id === id);

/** Deterministic pleasant color from any string (for new cards/contacts). */
export function colorFromString(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}
