import { SEED_TOKENS, chainById } from "./mock-data";

/** USD price for a token id; imported/custom tokens default to $1. */
const tokenUsd = (id: string) =>
  SEED_TOKENS.find((t) => t.id === id)?.usd ?? 1;

export type QuoteInput = {
  fromChainId: string;
  fromTokenId: string;
  amount: number;
  toChainId: string;
  toTokenId: string;
};

export type Quote = {
  sendAmount: number;
  sendTokenId: string;
  receiveAmount: number;
  receiveTokenId: string;
  feeUsd: number;
  gasCovered: boolean;
  /** hidden plumbing — only surfaced under "show routing details" */
  route: string[];
  privacy: "confidential";
  complianceScore: number;
  etaSeconds: number;
};

export type Receipt = {
  id: string;
  status: "confirmed";
  time: string;
  feeUsd: number;
  route: string[];
  privacy: "confidential";
  complianceScore: number;
  date: string;
};

export type DepositAccount = { address: string; chainId: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const randomAddress = () =>
  "0x" +
  Array.from({ length: 40 }, () =>
    "0123456789abcdef".charAt(Math.floor(Math.random() * 16))
  ).join("");

/**
 * Once the user confirms the quote, the backend provisions a fresh deposit
 * account for them to fund. (Mock: returns a random address after a delay.)
 */
export async function createDepositAccount(input: {
  fromChainId: string;
}): Promise<DepositAccount> {
  await wait(1300);
  return { address: randomAddress(), chainId: input.fromChainId };
}

/** Route hops: source chain → the STRK20 privacy pool → destination chain. */
function pickRoute(fromChainId: string, toChainId: string): string[] {
  const from = chainById(fromChainId)?.name ?? fromChainId;
  const to = chainById(toChainId)?.name ?? toChainId;
  return [from, "STRK20 pool", to];
}

/** Synchronous quote for a live, as-you-type readout on the compose screen. */
export function computeQuote(input: QuoteInput): Quote {
  const sendUsd = input.amount * tokenUsd(input.fromTokenId);
  const feeUsd = Math.max(0.02, sendUsd * 0.004);
  const receiveUsd = Math.max(0, sendUsd - feeUsd);
  const receiveAmount = receiveUsd / tokenUsd(input.toTokenId);
  return {
    sendAmount: input.amount,
    sendTokenId: input.fromTokenId,
    receiveAmount,
    receiveTokenId: input.toTokenId,
    feeUsd,
    gasCovered: true,
    route: pickRoute(input.fromChainId, input.toChainId),
    privacy: "confidential",
    complianceScore: 98,
    etaSeconds: 2,
  };
}

export async function quoteRoute(input: QuoteInput): Promise<Quote> {
  await wait(700);
  return computeQuote(input);
}

export async function executeSend(quote: Quote): Promise<Receipt> {
  await wait(2200);
  const id = `tx-${Math.floor(1000 + Math.random() * 9000)}`;
  return {
    id,
    status: "confirmed",
    time: "1.2s",
    feeUsd: quote.feeUsd,
    route: quote.route,
    privacy: "confidential",
    complianceScore: quote.complianceScore,
    date: new Date().toISOString(),
  };
}
