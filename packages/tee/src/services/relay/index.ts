// Relay.link API integration
// Cross-chain bridging via "deposit addresses": the user simply sends funds to
// an address and Relay fills on the destination chain to a chosen recipient —
// no wallet connection or signing required.
// Docs: https://docs.relay.link/features/deposit-addresses

import { logger } from '../../managers/log';

const RELAY_API = process.env.RELAY_API_URL || 'https://api.relay.link';

// EVM native-currency sentinel (used for refundTo auto-refunds and native swaps)
export const RELAY_NATIVE = '0x0000000000000000000000000000000000000000';

// Optional API key (higher rate limits) — sent as x-api-key per the Relay docs.
function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.RELAY_API_KEY) headers['x-api-key'] = process.env.RELAY_API_KEY;
  return headers;
}

export interface RelayDepositQuoteParams {
  /** Recipient wallet on the destination chain (Relay's `user`). */
  user: string;
  /** Address that receives funds on the destination chain. */
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  /** Token address on the origin chain (use RELAY_NATIVE for native). */
  originCurrency: string;
  /** Token address on the destination chain. */
  destinationCurrency: string;
  /** Amount in the origin token's smallest unit (string). */
  amount: string;
  tradeType?: 'EXACT_INPUT' | 'EXPECTED_OUTPUT' | 'EXACT_OUTPUT';
  /** Address to refund to on failure. Set to RELAY_NATIVE to auto-refund the depositor. */
  refundTo?: string;
  /** true => strict deposit address bound to this exact order (requires refundTo). */
  strict?: boolean;
}

export interface RelayDepositQuote {
  /** The address the user should send funds to on the origin chain. */
  depositAddress: string;
  /** Identifier used to poll fill status. */
  requestId: string;
  /** Expected amount delivered on the destination chain (smallest unit), if provided. */
  expectedOutputAmount?: string;
  /** Required input amount (smallest unit) — meaningful for EXACT_OUTPUT quotes. */
  requiredInputAmount?: string;
  /** USD value of the input amount (for fee floors), if provided. */
  amountInUsd?: string;
  /** Full raw quote response (kept for debugging / fee inspection). */
  raw: unknown;
}

export interface RelayStatusResponse {
  // v3 statuses: waiting | depositing | pending | submitted | delayed | success | refund | failure
  status: string;
  raw: unknown;
}

// Placeholder wallet for price-only quotes (no deposit address, no funds move).
// Relay derives the price from the token pair + amount, not the caller.
const RELAY_QUOTE_PLACEHOLDER = '0x000000000000000000000000000000000000dEaD';

// Fields we read off a /quote/v2 response, regardless of deposit-address mode.
function parseRelayQuote(data: any) {
  return {
    depositAddress: (data?.steps?.[0]?.depositAddress ?? data?.depositAddress) as string | undefined,
    requestId: (data?.steps?.[0]?.requestId ?? data?.requestId) as string | undefined,
    expectedOutputAmount: data?.details?.currencyOut?.amount as string | undefined,
    requiredInputAmount: data?.details?.currencyIn?.amount as string | undefined,
    amountInUsd: data?.details?.currencyIn?.amountUsd as string | undefined,
    etaSeconds:
      typeof data?.details?.timeEstimate === 'number' ? (data.details.timeEstimate as number) : undefined,
  };
}

// Single POST /quote/v2 entrypoint shared by the deposit-address and price-only paths.
async function postRelayQuote(
  params: RelayDepositQuoteParams | RelayPriceQuoteParams,
  useDepositAddress: boolean
): Promise<any | null> {
  const p = params as RelayDepositQuoteParams;
  const body = {
    user: p.user ?? RELAY_QUOTE_PLACEHOLDER,
    recipient: p.recipient ?? RELAY_QUOTE_PLACEHOLDER,
    originChainId: params.originChainId,
    destinationChainId: params.destinationChainId,
    originCurrency: params.originCurrency,
    destinationCurrency: params.destinationCurrency,
    amount: params.amount,
    tradeType: params.tradeType ?? 'EXACT_INPUT',
    useDepositAddress,
    ...(p.refundTo ? { refundTo: p.refundTo } : {}),
    ...(p.strict ? { strict: true } : {}),
  };

  const response = await fetch(`${RELAY_API}/quote/v2`, {
    method: 'POST',
    headers: relayHeaders(),
    body: JSON.stringify(body),
  });
  const data: any = await response.json();
  if (!response.ok) {
    logger.error(`Relay quote failed (${response.status})`, 'Relay', data);
    return null;
  }
  return data;
}

/**
 * Request a Relay deposit address for a cross-chain transfer.
 * Returns null on any error (mirrors the near-intents service convention).
 */
export async function getRelayDepositAddress(
  params: RelayDepositQuoteParams
): Promise<RelayDepositQuote | null> {
  try {
    logger.info(
      `Requesting Relay deposit address ${params.originChainId}->${params.destinationChainId} amount=${params.amount}`,
      'Relay'
    );
    const data = await postRelayQuote(params, true);
    if (!data) return null;

    const q = parseRelayQuote(data);
    if (!q.depositAddress || !q.requestId) {
      logger.error('Relay quote missing depositAddress/requestId', 'Relay', data);
      return null;
    }

    logger.info(`Relay deposit address ${q.depositAddress} (requestId ${q.requestId})`, 'Relay');
    return {
      depositAddress: q.depositAddress,
      requestId: q.requestId,
      expectedOutputAmount: q.expectedOutputAmount,
      requiredInputAmount: q.requiredInputAmount,
      amountInUsd: q.amountInUsd,
      raw: data,
    };
  } catch (error) {
    logger.error('Failed to get Relay deposit address', 'Relay', error);
    return null;
  }
}

export interface RelayPriceQuoteParams {
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
  amount: string;
  tradeType?: 'EXACT_INPUT' | 'EXPECTED_OUTPUT' | 'EXACT_OUTPUT';
}

export interface RelayPriceQuote {
  /** Expected amount delivered on the destination chain (smallest unit), if provided. */
  expectedOutputAmount?: string;
  /** Required input (smallest unit) — meaningful for EXACT_OUTPUT quotes. */
  requiredInputAmount?: string;
  /** USD value of the input amount (drives the fee floor). */
  amountInUsd?: string;
  /** Relay's time estimate for the fill (seconds), if provided. */
  etaSeconds?: number;
  raw: unknown;
}

/**
 * Price-only quote (no deposit address allocated) — safe to call on every
 * keystroke for a live quote readout. Returns null on any error.
 */
export async function getRelayQuote(params: RelayPriceQuoteParams): Promise<RelayPriceQuote | null> {
  try {
    const data = await postRelayQuote(params, false);
    if (!data) return null;
    const q = parseRelayQuote(data);
    return {
      expectedOutputAmount: q.expectedOutputAmount,
      requiredInputAmount: q.requiredInputAmount,
      amountInUsd: q.amountInUsd,
      etaSeconds: q.etaSeconds,
      raw: data,
    };
  } catch (error) {
    logger.error('Failed to get Relay price quote', 'Relay', error);
    return null;
  }
}

/**
 * Poll the fill status of a Relay request. Returns null on error.
 */
export async function getRelayStatus(requestId: string): Promise<RelayStatusResponse | null> {
  try {
    const response = await fetch(
      `${RELAY_API}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`,
      { method: 'GET', headers: relayHeaders() }
    );

    const data: any = await response.json();

    if (!response.ok) {
      logger.error(`Relay status failed (${response.status})`, 'Relay', data);
      return null;
    }

    const status: string = data?.status ?? 'unknown';
    return { status, raw: data };
  } catch (error) {
    logger.error('Failed to get Relay status', 'Relay', error);
    return null;
  }
}

export interface RelayCurrency {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  /** Human name + logo, when Relay provides them (used by the UI selectors). */
  name?: string;
  logoUrl?: string;
}

/**
 * List deposit-address-bridgeable currencies on a chain (optionally filtered by
 * `term`). Returns the authoritative address + decimals + display metadata that
 * the UI token selector needs. Empty array on error.
 */
export async function getRelayCurrencies(opts: {
  chainId: number;
  term?: string;
  limit?: number;
}): Promise<RelayCurrency[]> {
  try {
    const response = await fetch(`${RELAY_API}/currencies/v2`, {
      method: 'POST',
      headers: relayHeaders(),
      body: JSON.stringify({
        chainIds: [opts.chainId],
        ...(opts.term ? { term: opts.term } : {}),
        depositAddressOnly: true,
        verified: true,
        limit: opts.limit ?? 50,
      }),
    });
    const data: unknown = await response.json();
    if (!response.ok || !Array.isArray(data)) {
      logger.error(`Relay currencies failed (${response.status})`, 'Relay', data);
      return [];
    }
    const list = (data as unknown[]).flat() as Array<{
      chainId?: number;
      address?: string;
      symbol?: string;
      name?: string;
      decimals?: number;
      metadata?: { logoURI?: string };
      logoURI?: string;
    }>;
    return list
      .filter((c) => c && c.chainId === opts.chainId && typeof c.address === 'string' && c.decimals != null)
      .map((c) => ({
        chainId: opts.chainId,
        address: c.address as string,
        symbol: c.symbol ?? '',
        decimals: c.decimals as number,
        name: c.name,
        logoUrl: c.metadata?.logoURI ?? c.logoURI,
      }));
  } catch (error) {
    logger.error('Failed to list Relay currencies', 'Relay', error);
    return [];
  }
}

/**
 * Resolve a token on a chain to its deposit-address-bridgeable currency via
 * Relay's currencies API (authoritative address + decimals). Returns null if the
 * token isn't supported for deposit-address bridging on that chain.
 */
export async function resolveCurrency(chainId: number, term: string): Promise<RelayCurrency | null> {
  const list = await getRelayCurrencies({ chainId, term, limit: 20 });
  if (list.length === 0) return null;
  return list.find((c) => c.symbol.toUpperCase() === term.toUpperCase()) ?? list[0];
}

export interface RelayChain {
  chainId: number;
  name: string;
  displayName: string;
  logoUrl?: string;
}

// GET /chains rarely changes; cache it for the process lifetime.
let chainsCache: RelayChain[] | null = null;

/**
 * List chains Relay can bridge to/from via deposit addresses. Cached in-process.
 * Returns [] on error.
 */
export async function getRelayChains(): Promise<RelayChain[]> {
  if (chainsCache) return chainsCache;
  try {
    const response = await fetch(`${RELAY_API}/chains`, { method: 'GET', headers: relayHeaders() });
    const data: any = await response.json();
    if (!response.ok) {
      logger.error(`Relay chains failed (${response.status})`, 'Relay', data);
      return [];
    }
    const raw: any[] = Array.isArray(data) ? data : (data?.chains ?? []);
    const chains = raw
      .filter((c) => typeof c?.id === 'number')
      .map((c) => ({
        chainId: c.id as number,
        name: (c.name ?? String(c.id)) as string,
        displayName: (c.displayName ?? c.name ?? String(c.id)) as string,
        logoUrl: c.iconUrl ?? c.logoUrl ?? c.icon?.url,
      }));
    if (chains.length > 0) chainsCache = chains;
    return chains;
  } catch (error) {
    logger.error('Failed to list Relay chains', 'Relay', error);
    return [];
  }
}

/** Best-effort display name for a chain id (falls back to `Chain <id>`). */
export function chainDisplayName(chainId: number): string {
  return chainsCache?.find((c) => c.chainId === chainId)?.displayName ?? `Chain ${chainId}`;
}

/** True when a Relay request has been filled on the destination chain. */
export function isRelayFilled(status: string): boolean {
  return status === 'success';
}

/** True when a Relay request has terminally failed / refunded. */
export function isRelayFailed(status: string): boolean {
  return status === 'failure' || status === 'refund';
}
