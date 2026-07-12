// Quote preview: what will the user receive, and what's our fee? Computed the
// same way route creation computes it, but WITHOUT persisting anything or
// allocating a deposit address — safe to call on every keystroke.
//
// Cross-token aware: the source token is bridged to the hub and shielded; the
// guaranteed output is priced in the (possibly different) destination token via
// a hub -> destination quote.

import { getRelayQuote, getRelayChains, chainDisplayName } from '../relay';
import { computeServiceFee } from './fee';
import { resolveRouteTokens, type RouteTokensInput } from './shared';

export type QuotePrivateRouteInput = RouteTokensInput;

export interface QuotePrivateRouteResult {
  /** Source token (what the user sends). */
  symbol: string;
  decimals: number;
  /** Destination token (what the user receives). */
  destSymbol: string;
  destDecimals: number;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  /** Input amount, source token smallest unit (string). */
  amount: string;
  /** Route fee (spread), source token smallest unit. */
  feeAmount: string;
  /** Guaranteed output delivered to the user, DESTINATION token smallest unit. */
  quotedOutputAmount: string;
  /** USD value of the input / fee, when Relay provides a price (else null). */
  amountInUsd: number | null;
  feeUsd: number | null;
  /** Rough end-to-end estimate (seconds). */
  etaSeconds: number;
  /** Display hops for the UI route trail. */
  route: string[];
}

export async function quotePrivateRoute(input: QuotePrivateRouteInput): Promise<QuotePrivateRouteResult> {
  const { symbol, destSymbol, hubChainId, amount, source, hub, dest } = await resolveRouteTokens(input);

  // Leg-1 (source -> hub): values the input in USD for the fee floor.
  const leg1 = await getRelayQuote({
    originChainId: input.sourceChainId,
    destinationChainId: hubChainId,
    originCurrency: source.address,
    destinationCurrency: hub.address,
    amount: amount.toString(),
    tradeType: 'EXACT_INPUT',
  });

  const amountInUsd = leg1?.amountInUsd ? Number(leg1.amountInUsd) : null;

  // Fee = the spread between what the user sends and the output we GUARANTEE to
  // deliver: max($ floor, bps of amount). See config/global-config.ts.
  const fee = computeServiceFee(amount, amountInUsd);
  if (fee >= amount) throw new Error('Invalid amount: too small — the fee would exceed the amount');
  const afterFee = amount - fee; // source-token units routed onward from the hub

  // Guaranteed output = bridge the post-fee amount from the hub token to the
  // destination token. Same asset + same decimals degenerates to `afterFee`.
  let quotedOutput: bigint;
  const sameAsset = hub.address.toLowerCase() === dest.address.toLowerCase() && hub.decimals === dest.decimals;
  if (sameAsset) {
    quotedOutput = afterFee;
  } else {
    const leg2 = await getRelayQuote({
      originChainId: hubChainId,
      destinationChainId: input.destChainId,
      originCurrency: hub.address,
      destinationCurrency: dest.address,
      amount: afterFee.toString(),
      tradeType: 'EXACT_INPUT',
    });
    if (!leg2?.expectedOutputAmount) throw new Error(`Route unavailable for ${symbol} → ${destSymbol}`);
    quotedOutput = BigInt(leg2.expectedOutputAmount);
  }
  if (quotedOutput <= 0n) throw new Error('Invalid amount: too small for this route');

  // Rough total = leg-1 bridge + shield/unshield + leg-2 bridge.
  const legEta = leg1?.etaSeconds ?? 30;
  const etaSeconds = legEta * 2 + 60;

  await getRelayChains(); // populate the in-process display-name cache
  const route = [chainDisplayName(input.sourceChainId), 'Private pool (Arbitrum)', chainDisplayName(input.destChainId)];

  const feeUsd = amountInUsd != null && amount > 0n ? amountInUsd * (Number(fee) / Number(amount)) : null;

  return {
    symbol,
    decimals: source.decimals,
    destSymbol,
    destDecimals: dest.decimals,
    sourceChainId: input.sourceChainId,
    destChainId: input.destChainId,
    hubChainId,
    amount: amount.toString(),
    feeAmount: fee.toString(),
    quotedOutputAmount: quotedOutput.toString(),
    amountInUsd,
    feeUsd,
    etaSeconds,
    route,
  };
}
