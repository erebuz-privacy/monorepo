// Relay.link API integration
// Cross-chain bridging via "deposit addresses": the user simply sends funds to
// an address and Relay fills on the destination chain to a chosen recipient —
// no wallet connection or signing required.
// Docs: https://docs.relay.link/features/deposit-addresses

import { logger } from '../../managers/log';

const RELAY_API = process.env.RELAY_API_URL || 'https://api.relay.link';

// EVM native-currency sentinel (used for refundTo auto-refunds and native swaps)
export const RELAY_NATIVE = '0x0000000000000000000000000000000000000000';

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
  /** Full raw quote response (kept for debugging / fee inspection). */
  raw: unknown;
}

export interface RelayStatusResponse {
  // Relay intent statuses: waiting | pending | success | failure | refund | delayed | ...
  status: string;
  raw: unknown;
}

/**
 * Request a Relay deposit address for a cross-chain transfer.
 * Returns null on any error (mirrors the near-intents service convention).
 */
export async function getRelayDepositAddress(
  params: RelayDepositQuoteParams
): Promise<RelayDepositQuote | null> {
  try {
    const body = {
      user: params.user,
      recipient: params.recipient,
      originChainId: params.originChainId,
      destinationChainId: params.destinationChainId,
      originCurrency: params.originCurrency,
      destinationCurrency: params.destinationCurrency,
      amount: params.amount,
      tradeType: params.tradeType ?? 'EXACT_INPUT',
      useDepositAddress: true,
      ...(params.refundTo ? { refundTo: params.refundTo } : {}),
      ...(params.strict ? { strict: true } : {}),
    };

    logger.info(
      `Requesting Relay deposit address ${params.originChainId}->${params.destinationChainId} amount=${params.amount}`,
      'Relay'
    );

    const response = await fetch(`${RELAY_API}/quote/v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: any = await response.json();

    if (!response.ok) {
      logger.error(`Relay quote failed (${response.status})`, 'Relay', data);
      return null;
    }

    // In deposit-address mode the address + requestId live on the first step.
    const depositAddress: string | undefined =
      data?.steps?.[0]?.depositAddress ?? data?.depositAddress;
    const requestId: string | undefined =
      data?.steps?.[0]?.requestId ?? data?.requestId;
    const expectedOutputAmount: string | undefined = data?.details?.currencyOut?.amount;

    if (!depositAddress || !requestId) {
      logger.error('Relay quote missing depositAddress/requestId', 'Relay', data);
      return null;
    }

    logger.info(`Relay deposit address ${depositAddress} (requestId ${requestId})`, 'Relay');
    return { depositAddress, requestId, expectedOutputAmount, raw: data };
  } catch (error) {
    logger.error('Failed to get Relay deposit address', 'Relay', error);
    return null;
  }
}

/**
 * Poll the fill status of a Relay request. Returns null on error.
 */
export async function getRelayStatus(requestId: string): Promise<RelayStatusResponse | null> {
  try {
    const response = await fetch(
      `${RELAY_API}/intents/status?requestId=${encodeURIComponent(requestId)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
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

/** True when a Relay request has been filled on the destination chain. */
export function isRelayFilled(status: string): boolean {
  return status === 'success';
}

/** True when a Relay request has terminally failed / refunded. */
export function isRelayFailed(status: string): boolean {
  return status === 'failure' || status === 'refund';
}
