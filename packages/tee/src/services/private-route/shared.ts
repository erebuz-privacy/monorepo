// Shared route resolution used by both the quote preview and route creation, so
// the two never diverge on which token/decimals/amount they compute against.

import { parseUnits } from 'viem';
import { resolveCurrency, type RelayCurrency } from '../relay';
import { PRIVACY_HUB_CHAIN_ID } from '../../config/global-config';

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
  /** Source symbol (also the symbol shielded on the hub). */
  symbol: string;
  /** Destination symbol delivered to the user (may differ from `symbol`). */
  destSymbol: string;
  hubChainId: number;
  /** Input amount in the source token's smallest unit. */
  amount: bigint;
  source: RelayCurrency;
  /** Source symbol resolved on the hub chain (what Railgun shields). */
  hub: RelayCurrency;
  /** Destination symbol resolved on the destination chain. */
  dest: RelayCurrency;
}

/**
 * Resolve the source token (on the source + hub chains) and the destination
 * token (on the destination chain). All must be deposit-address bridgeable —
 * Railgun shields any ERC-20, so Relay's coverage is the limiter. Parses the
 * amount to the source token's smallest unit. Throws a user-facing message on
 * any unsupported chain/token or invalid amount.
 */
export async function resolveRouteTokens(input: RouteTokensInput): Promise<ResolvedRoute> {
  const symbol = (input.tokenSymbol ?? 'USDC').toUpperCase();
  const destSymbol = (input.destTokenSymbol ?? symbol).toUpperCase();
  const hubChainId = PRIVACY_HUB_CHAIN_ID;

  const [source, hub, dest] = await Promise.all([
    resolveCurrency(input.sourceChainId, symbol),
    resolveCurrency(hubChainId, symbol),
    resolveCurrency(input.destChainId, destSymbol),
  ]);
  if (!source) throw new Error(`Unsupported token ${symbol} on source chain ${input.sourceChainId}`);
  if (!hub) throw new Error(`Unsupported token ${symbol} on hub chain ${hubChainId}`);
  if (!dest) throw new Error(`Unsupported token ${destSymbol} on destination chain ${input.destChainId}`);

  let amount: bigint;
  try {
    amount = parseUnits(input.amount, source.decimals);
  } catch {
    throw new Error('Invalid amount');
  }
  if (amount <= 0n) throw new Error('Invalid amount: must be greater than 0');

  return { symbol, destSymbol, hubChainId, amount, source, hub, dest };
}
