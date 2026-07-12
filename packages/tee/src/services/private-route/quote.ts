// Quote preview: what will the user receive, and what's our fee? Computed the
// same way route creation computes it, but WITHOUT persisting anything or
// allocating a deposit address — safe to call on every keystroke.
//
// Fee model: the source token is bridged (and, for cross-token routes, swapped)
// by Relay into the DESTINATION token. Our fee is charged on that output token,
// not the input. e.g. 100 USDC in -> Relay yields 0.1 ETH -> we take
// max($1, 1.5%) of the 0.1 ETH and deliver the rest.

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
  /** Route fee (spread), DESTINATION token smallest unit (charged on the output). */
  feeAmount: string;
  /** Output delivered to the user, DESTINATION token smallest unit (= gross - fee). */
  quotedOutputAmount: string;
  /** USD value of the input, and of the delivered output / fee (null if unpriced). */
  amountInUsd: number | null;
  quotedOutputUsd: number | null;
  feeUsd: number | null;
  /** Rough end-to-end estimate (seconds). */
  etaSeconds: number;
  /** Display hops for the UI route trail. */
  route: string[];
}

export async function quotePrivateRoute(input: QuotePrivateRouteInput): Promise<QuotePrivateRouteResult> {
  const { symbol, destSymbol, hubChainId, amount, source, hub, dest } = await resolveRouteTokens(input);

  // Leg-1 (source -> hub): the full input is bridged to the hub token.
  const leg1 = await getRelayQuote({
    originChainId: input.sourceChainId,
    destinationChainId: hubChainId,
    originCurrency: source.address,
    destinationCurrency: hub.address,
    amount: amount.toString(),
    tradeType: 'EXACT_INPUT',
  });
  const amountInUsd = leg1?.amountInUsd ? Number(leg1.amountInUsd) : null;
  const hubAmount = leg1?.expectedOutputAmount ? BigInt(leg1.expectedOutputAmount) : amount;

  // Leg-2 (hub -> destination): Relay swaps/bridges the hub amount into the
  // destination token. This is the GROSS output before our fee.
  const sameAsset = hub.address.toLowerCase() === dest.address.toLowerCase() && hub.decimals === dest.decimals;
  let grossOutput: bigint;
  let outputUsd: number | null;
  if (sameAsset) {
    grossOutput = hubAmount;
    outputUsd = amountInUsd;
  } else {
    const leg2 = await getRelayQuote({
      originChainId: hubChainId,
      destinationChainId: input.destChainId,
      originCurrency: hub.address,
      destinationCurrency: dest.address,
      amount: hubAmount.toString(),
      tradeType: 'EXACT_INPUT',
    });
    if (!leg2?.expectedOutputAmount) throw new Error(`Route unavailable for ${symbol} to ${destSymbol}`);
    grossOutput = BigInt(leg2.expectedOutputAmount);
    outputUsd = leg2.outputUsd ? Number(leg2.outputUsd) : null;
  }
  if (grossOutput <= 0n) throw new Error('Invalid amount: too small for this route');

  // Fee = max($ floor, bps) charged on the OUTPUT (destination token).
  const fee = computeServiceFee(grossOutput, outputUsd);
  if (fee >= grossOutput) throw new Error('Invalid amount: too small — the fee would exceed the output');
  const quotedOutput = grossOutput - fee;

  // Rough total = leg-1 bridge + shield/unshield + leg-2 bridge.
  const legEta = leg1?.etaSeconds ?? 30;
  const etaSeconds = legEta * 2 + 60;

  await getRelayChains(); // populate the in-process display-name cache
  const route = [chainDisplayName(input.sourceChainId), 'Private pool (Arbitrum)', chainDisplayName(input.destChainId)];

  const feeUsd = outputUsd != null && grossOutput > 0n ? outputUsd * (Number(fee) / Number(grossOutput)) : null;
  const quotedOutputUsd =
    outputUsd != null && grossOutput > 0n ? outputUsd * (Number(quotedOutput) / Number(grossOutput)) : null;

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
    quotedOutputUsd,
    feeUsd,
    etaSeconds,
    route,
  };
}
