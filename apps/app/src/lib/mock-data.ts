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

export type Holding = {
  chainId: string;
  tokenId: string;
  amount: number;
};

export type TxStatus = "confirmed" | "pending" | "failed";

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

export const SEED_CARDS: Card[] = [
  {
    id: "card-gnosis",
    name: "Gnosis Pay",
    address: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
    chainId: "arbitrum",
    tokenId: "usdc",
    color: "#133629",
  },
  {
    id: "card-coinbase",
    name: "Coinbase Card",
    address: "0x2c3abce7462f6e34f1c0a4f0d67e9b0a3c1b7f2e",
    chainId: "base",
    tokenId: "usdc",
    color: "#0052FF",
  },
];

export const SEED_CONTACTS: Contact[] = [
  {
    id: "c-alice",
    name: "Alice",
    handle: "alice.eth",
    address: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    color: "#8B5CF6",
  },
  {
    id: "c-bob",
    name: "Bob",
    handle: "bob.base.eth",
    address: "0x9f8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6",
    color: "#EC4899",
  },
  {
    id: "c-carol",
    name: "Carol",
    address: "0x3c2b1a0f9e8d7c6b5a49382716051423f6e5d4c3",
    color: "#14B8A6",
  },
];

/** Unified private balance, broken down by chain + token. */
export const HOLDINGS: Holding[] = [
  { chainId: "base", tokenId: "usdc", amount: 642.18 },
  { chainId: "arbitrum", tokenId: "usdc", amount: 310.5 },
  { chainId: "polygon", tokenId: "usdt", amount: 180.0 },
  { chainId: "ethereum", tokenId: "eth", amount: 0.031 },
];

export const SEED_ACTIVITY: Activity[] = [
  {
    id: "tx-1041",
    date: "2026-07-06T14:22:00Z",
    fromChainId: "base",
    fromTokenId: "usdc",
    toLabel: "Gnosis Pay",
    toChainId: "arbitrum",
    toTokenId: "usdc",
    sendAmount: 100,
    receiveAmount: 99.58,
    feeUsd: 0.42,
    status: "confirmed",
    route: ["Base", "STRK20 pool", "Arbitrum"],
  },
  {
    id: "tx-1039",
    date: "2026-07-04T09:10:00Z",
    fromChainId: "polygon",
    fromTokenId: "usdt",
    toLabel: "alice.eth",
    toChainId: "ethereum",
    toTokenId: "usdc",
    sendAmount: 50,
    receiveAmount: 49.71,
    feeUsd: 0.29,
    status: "confirmed",
    route: ["Polygon", "STRK20 pool", "Ethereum"],
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
