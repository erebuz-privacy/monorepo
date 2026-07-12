// Shared route resolution used by both the quote preview and route creation, so
// the two never diverge on which token/decimals/amount they compute against.

import { parseUnits } from 'viem';
import { resolveCurrency, type RelayCurrency } from '../relay';
import { PRIVACY_HUB_CHAIN_ID, PRIVACY_HUB_TOKEN_SYMBOL } from '../../config/global-config';

export interface RouteTokensInput {
  sourceChainId: number;
  destChainId: number;
  /** Human-readable amount, e.g. "5". */
  amount: string;
  /** Source token symbol; defaults to USDC. Bridged/shielded through the hub. */
  tokenSymbol?: string;
  /** Destination token symbol; defaults to the source symbol (same-asset route). */
  destTokenSymbol?: string;
}

export interface ResolvedRoute {
  /** Source symbol the user sends. */
  symbol: string;
  /** Destination symbol delivered to the user (may differ from `symbol`). */
  destSymbol: string;
  /** Canonical token shielded on the hub (e.g. USDC on Arbitrum). */
  hubSymbol: string;
  hubChainId: number;
  /** Input amount in the source token's smallest unit. */
  amount: bigint;
  source: RelayCurrency;
  /** The canonical hub token resolved on the hub chain (what Railgun shields). */
  hub: RelayCurrency;
  /** Destination token resolved on the destination chain. */
  dest: RelayCurrency;
}

/**
 * Resolve the source token, the canonical hub token, and the destination token.
 * Relay swaps the source into the hub token on the way in and the hub token into
 * the destination on the way out, so the source/destination need NOT exist on
 * the hub chain — only the canonical hub token must. Parses the amount to the
 * source token's smallest unit. Throws a user-facing message on any unsupported
 * chain/token or invalid amount.
 */
export async function resolveRouteTokens(input: RouteTokensInput): Promise<ResolvedRoute> {
  const symbol = (input.tokenSymbol ?? 'USDC').toUpperCase();
  const destSymbol = (input.destTokenSymbol ?? symbol).toUpperCase();
  const hubChainId = PRIVACY_HUB_CHAIN_ID;
  const hubTokenSymbol = PRIVACY_HUB_TOKEN_SYMBOL.toUpperCase();

  const [source, hub, dest] = await Promise.all([
    resolveCurrency(input.sourceChainId, symbol),
    resolveCurrency(hubChainId, hubTokenSymbol),
    resolveCurrency(input.destChainId, destSymbol),
  ]);
  if (!source) throw new Error(`${symbol} isn't bridgeable from chain ${input.sourceChainId}`);
  if (!hub) throw new Error(`Hub token ${hubTokenSymbol} is unavailable on the privacy hub`);
  if (!dest) throw new Error(`${destSymbol} isn't bridgeable to chain ${input.destChainId}`);

  let amount: bigint;
  try {
    amount = parseUnits(input.amount, source.decimals);
  } catch {
    throw new Error('Invalid amount');
  }
  if (amount <= 0n) throw new Error('Invalid amount: must be greater than 0');

  return { symbol, destSymbol, hubSymbol: hub.symbol, hubChainId, amount, source, hub, dest };
}
