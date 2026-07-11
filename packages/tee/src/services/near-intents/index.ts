// NEAR Intents 1Click API Integration
// For cross-chain swaps to Zcash
// Docs: https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api

import { logger } from '../../managers/log';

const NEAR_INTENTS_API = 'https://1click.chaindefuser.com/v0';

// Chain prefixes for asset IDs (format: nep141:{prefix}-{address}.omft.near)
const CHAIN_PREFIXES: Record<number, string> = {
  8453: 'base',      // Base
  137: 'pol',        // Polygon
  42161: 'arb',      // Arbitrum
  10: 'op',          // Optimism
};

// Supported tokens on different chains
// Includes USDC, USDT, and WETH where available
export const SUPPORTED_TOKENS: Record<number, Record<string, { address: string; assetId: string; decimals: number }>> = {
  // Base (chainId: 8453)
  8453: {
    USDC: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
      decimals: 6,
    },
    WETH: {
      address: '0x4200000000000000000000000000000000000006',
      assetId: 'nep141:base-0x4200000000000000000000000000000000000006.omft.near',
      decimals: 18,
    },
  },
  // Polygon (chainId: 137)
  137: {
    USDC: {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      assetId: 'nep141:pol-0x3c499c542cef5e3811e1192ce70d8cc03d5c3359.omft.near',
      decimals: 6,
    },
    WETH: {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      assetId: 'nep141:pol-0x7ceb23fd6bc0add59e62ac25578270cff1b9f619.omft.near',
      decimals: 18,
    },
  },
  // Arbitrum (chainId: 42161)
  42161: {
    USDC: {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
      decimals: 6,
    },
    WETH: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      assetId: 'nep141:arb-0x82af49447d8a07e3bd95bd0d56f35241523fbab1.omft.near',
      decimals: 18,
    },
  },
  // Optimism (chainId: 10)
  10: {
    USDC: {
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      assetId: 'nep141:op-0x0b2c639c533813f4aa9d7837caf62653d097ff85.omft.near',
      decimals: 6,
    },
    WETH: {
      address: '0x4200000000000000000000000000000000000006',
      assetId: 'nep141:op-0x4200000000000000000000000000000000000006.omft.near',
      decimals: 18,
    },
  },
};

// Zcash asset ID
export const ZCASH_ASSET_ID = 'nep141:zec.omft.near';

export interface TokenInfo {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: string;
  priceUpdatedAt: string;
  contractAddress: string;
}

export interface QuoteRequest {
  dry?: boolean;
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT' | 'ANY_INPUT';
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  slippageTolerance?: number;
  depositType: 'ORIGIN_CHAIN' | 'INTENTS';
  recipientType: 'DESTINATION_CHAIN' | 'INTENTS';
  refundType: 'ORIGIN_CHAIN' | 'INTENTS';
  deadline?: string;
}

export interface QuoteResponse {
  depositAddress: string;
  depositMemo?: string;
  amountIn: string;
  amountOut: string;
  minAmountIn?: string;
  minAmountOut?: string;
  timeEstimate?: number;
  deadline: string;
}

export interface DepositStatus {
  status: 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED';
  depositAddress: string;
  depositMemo?: string;
  txHash?: string;
  outputTxHash?: string;
  refundTxHash?: string;
}

/**
 * Fetch supported tokens from NEAR Intents API
 */
export async function fetchSupportedTokens(): Promise<TokenInfo[]> {
  try {
    const response = await fetch(`${NEAR_INTENTS_API}/tokens`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`NEAR Intents tokens error: ${error}`, 'NearIntents');
      return [];
    }

    const tokens = await response.json() as TokenInfo[];
    logger.info(`Fetched ${tokens.length} supported tokens from NEAR Intents`, 'NearIntents');
    return tokens;
  } catch (error) {
    logger.error('Failed to fetch supported tokens', 'NearIntents', error);
    return [];
  }
}

/**
 * Get a quote for swapping tokens to Zcash
 */
export async function getQuote(
  chainId: number,
  tokenSymbol: string,
  amount: string,
  zcashAddress: string,
  refundAddress: string,
  slippageTolerance = 100 // 1% in basis points
): Promise<QuoteResponse | null> {
  try {
    const token = SUPPORTED_TOKENS[chainId]?.[tokenSymbol];
    if (!token) {
      logger.error(`Token ${tokenSymbol} not supported on chain ${chainId}`, 'NearIntents');
      return null;
    }

    // Validate Zcash address (transparent addresses start with t1 or t3)
    if (!zcashAddress.startsWith('t1') && !zcashAddress.startsWith('t3')) {
      logger.error(`Invalid Zcash address: ${zcashAddress}. Only transparent addresses (t1, t3) are supported`, 'NearIntents');
      return null;
    }

    const deadline = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

    const requestBody: QuoteRequest = {
      dry: false,
      swapType: 'EXACT_INPUT',
      slippageTolerance,
      originAsset: token.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: ZCASH_ASSET_ID,
      recipientType: 'DESTINATION_CHAIN',
      amount,
      recipient: zcashAddress,
      refundTo: refundAddress,
      refundType: 'ORIGIN_CHAIN',
      deadline,
    };

    logger.info(`Requesting quote from NEAR Intents`, 'NearIntents', {
      originAsset: token.assetId,
      destinationAsset: ZCASH_ASSET_ID,
      amount,
      recipient: zcashAddress,
    });

    const response = await fetch(`${NEAR_INTENTS_API}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`NEAR Intents API error: ${error}`, 'NearIntents');
      return null;
    }

    const data = await response.json() as { quote?: QuoteResponse };

    if (!data.quote) {
      logger.error(`No quote in response`, 'NearIntents', data);
      return null;
    }

    logger.info(`Got quote from NEAR Intents`, 'NearIntents', {
      depositAddress: data.quote.depositAddress,
      amountIn: data.quote.amountIn,
      amountOut: data.quote.amountOut,
      timeEstimate: data.quote.timeEstimate,
    });

    return data.quote;
  } catch (error) {
    logger.error('Failed to get NEAR Intents quote', 'NearIntents', error);
    return null;
  }
}

/**
 * Get the status of a deposit
 */
export async function getDepositStatus(
  depositAddress: string,
  depositMemo?: string
): Promise<DepositStatus | null> {
  try {
    let url = `${NEAR_INTENTS_API}/status?depositAddress=${encodeURIComponent(depositAddress)}`;
    if (depositMemo) {
      url += `&depositMemo=${encodeURIComponent(depositMemo)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`NEAR Intents status error: ${error}`, 'NearIntents');
      return null;
    }

    const status = await response.json() as DepositStatus;
    logger.info(`Deposit status: ${status.status}`, 'NearIntents', { depositAddress });
    return status;
  } catch (error) {
    logger.error('Failed to get deposit status', 'NearIntents', error);
    return null;
  }
}

/**
 * Submit deposit transaction hash to speed up processing
 */
export async function submitDeposit(
  depositAddress: string,
  txHash: string,
  memo?: string
): Promise<boolean> {
  try {
    const body: Record<string, string> = {
      depositAddress,
      txHash,
    };

    if (memo) {
      body.memo = memo;
    }

    const response = await fetch(`${NEAR_INTENTS_API}/deposit/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`NEAR Intents submit error: ${error}`, 'NearIntents');
      return false;
    }

    logger.info(`Submitted deposit to NEAR Intents`, 'NearIntents', { depositAddress, txHash });
    return true;
  } catch (error) {
    logger.error('Failed to submit deposit', 'NearIntents', error);
    return false;
  }
}

/**
 * Get token info for a chain
 */
export function getTokenInfo(chainId: number, tokenSymbol: string) {
  return SUPPORTED_TOKENS[chainId]?.[tokenSymbol] || null;
}

/**
 * Check if a token is supported for NEAR Intents
 */
export function isTokenSupported(chainId: number, tokenSymbol: string): boolean {
  return !!SUPPORTED_TOKENS[chainId]?.[tokenSymbol];
}

/**
 * Build asset ID for a token on a chain
 */
export function buildAssetId(chainId: number, tokenAddress: string): string | null {
  const prefix = CHAIN_PREFIXES[chainId];
  if (!prefix) {
    return null;
  }
  return `nep141:${prefix}-${tokenAddress.toLowerCase()}.omft.near`;
}
