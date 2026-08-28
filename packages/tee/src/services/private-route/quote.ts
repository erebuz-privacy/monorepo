// Quote preview: what will the user receive, and what's our fee? Computed the
// same way route creation computes it, but WITHOUT persisting anything or
// allocating a deposit address — safe to call on every keystroke.
//
// Fee model: the source token is bridged (and, for cross-token routes, swapped)
// by Relay into the DESTINATION token. Our fee is charged on that output token,
// not the input. e.g. 100 USDC in -> Relay yields 0.1 ETH -> we take
// max($1, 1.5%) of the 0.1 ETH and deliver the rest.

import { parseUnits } from 'viem';
import { getRelayQuote, getRelayChains, chainDisplayName } from '../relay';
import { cctpChainName, cctpCanBeSource, cctpFeeBps, cctpSupportsChainForHub } from '../cctp';
import {
  ARC_PRIVACY_HUB_CHAIN_ID,
  BRIDGE_PROVIDER,
  DEFAULT_PRIVACY_PROVIDER,
  PRIVACY_HUB_CHAIN_ID,
  STRK20_PRIVACY_HUB_CHAIN_ID,
  STRK20_TRANSPORT_ONLY,
  isPrivacyProvider,
} from '../../config/global-config';
import {
  computeServiceFee,
  computeArcCctpRouteFees,
  computeCctpRouteFees,
  computeStrk20RouteFees,
} from './fee';
import { resolveRouteTokens, type RouteTokensInput } from './shared';

export type QuotePrivateRouteInput = RouteTokensInput;

export interface QuotePrivateRouteResult {
  privacyProvider: 'railgun' | 'arc' | 'strk20';
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
  /** Our service fee (spread), DESTINATION token smallest unit (our margin). */
  feeAmount: string;
  /** CCTP bridge fee borne by the user (dest leg), DEST smallest unit. "0" for Relay. */
  bridgeFeeAmount: string;
  /** Railgun privacy (unshield) fee, DEST smallest unit. "0" for Relay. */
  privacyFeeAmount: string;
  /** Output delivered to the user, DEST smallest unit (= amount − all fees). delivered ≥ this. */
  quotedOutputAmount: string;
  /** USD value of the input, and of the delivered output / fees (null if unpriced). */
  amountInUsd: number | null;
  quotedOutputUsd: number | null;
  feeUsd: number | null;
  bridgeFeeUsd: number | null;
  privacyFeeUsd: number | null;
  /** Rough end-to-end estimate (seconds). */
  etaSeconds: number;
  /** Display hops for the UI route trail. */
  route: string[];
  /**
   * TRUE when this route moves funds WITHOUT a privacy hop (demo mode). The UI
   * must warn on it — it is not a private transfer.
   */
  transportOnly?: boolean;
}

/** Which chain hosts the privacy pool for a provider. */
export function privacyHubChainId(provider: 'railgun' | 'arc' | 'strk20'): number {
  if (provider === 'arc') return ARC_PRIVACY_HUB_CHAIN_ID;
  if (provider === 'strk20') return STRK20_PRIVACY_HUB_CHAIN_ID;
  return PRIVACY_HUB_CHAIN_ID;
}

export async function quotePrivateRoute(input: QuotePrivateRouteInput): Promise<QuotePrivateRouteResult> {
  const privacyProvider = input.privacyProvider ?? DEFAULT_PRIVACY_PROVIDER;
  if (!isPrivacyProvider(privacyProvider)) throw new Error('Invalid privacyProvider');
  // CCTP mode: USDC bridges 1:1 (burn/mint), no slippage. Output = amount minus
  // our service fee, the Railgun unshield fee, and the CCTP dest-leg fee — all
  // subtracted so the recipient receives at least the shown amount.
  if (BRIDGE_PROVIDER === 'cctp' || privacyProvider === 'arc' || privacyProvider === 'strk20') {
    const hubChainId = privacyHubChainId(privacyProvider);
    // The user pays FROM the source, so it needs per-route Nexus deposit accounts.
    // Non-EVM chains (Starknet) can be a hub or a destination, never a source.
    if (!cctpCanBeSource(input.sourceChainId)) {
      throw new Error(`Unsupported source chain ${input.sourceChainId}: non-EVM chains cannot be a route source`);
    }
    if (
      !cctpSupportsChainForHub(input.sourceChainId, hubChainId) ||
      !cctpSupportsChainForHub(input.destChainId, hubChainId)
    ) {
      throw new Error(`Unsupported CCTP route: ${input.sourceChainId} -> ${input.destChainId}`);
    }
    if (
      (input.tokenSymbol ?? 'USDC').toUpperCase() !== 'USDC' ||
      (input.destTokenSymbol ?? 'USDC').toUpperCase() !== 'USDC'
    ) {
      throw new Error('Invalid token: CCTP privacy routes currently support USDC only');
    }
    const amount = parseUnits(input.amount, 6);
    const outputUsd = Number(amount) / 1e6;
    // Circle's REAL fee for the destination-facing burn (hub -> dest). Critical
    // for a Starknet hub, whose outbound leg is 14 bps where Sepolia's is 1.
    const bridgeFeeBps = await cctpFeeBps(hubChainId, input.destChainId);
    const strk20TransportOnly = privacyProvider === 'strk20' && STRK20_TRANSPORT_ONLY;
    const fees =
      privacyProvider === 'arc'
        ? computeArcCctpRouteFees(amount, outputUsd, bridgeFeeBps)
        : privacyProvider === 'strk20'
          ? computeStrk20RouteFees(amount, outputUsd, bridgeFeeBps)
          : computeCctpRouteFees(amount, outputUsd, bridgeFeeBps);
    const { serviceFee, bridgeFee, quotedOutput } = fees;
    const privacyFee = 'privacyFee' in fees ? fees.privacyFee : 0n;
    return {
      privacyProvider,
      symbol: 'USDC',
      decimals: 6,
      destSymbol: 'USDC',
      destDecimals: 6,
      sourceChainId: input.sourceChainId,
      destChainId: input.destChainId,
      hubChainId,
      amount: amount.toString(),
      feeAmount: serviceFee.toString(),
      bridgeFeeAmount: bridgeFee.toString(),
      privacyFeeAmount: privacyFee.toString(),
      quotedOutputAmount: quotedOutput.toString(),
      amountInUsd: outputUsd,
      quotedOutputUsd: Number(quotedOutput) / 1e6,
      feeUsd: Number(serviceFee) / 1e6,
      bridgeFeeUsd: Number(bridgeFee) / 1e6,
      privacyFeeUsd: Number(privacyFee) / 1e6,
      etaSeconds:
        privacyProvider === 'arc' ? 300 : privacyProvider === 'strk20' ? (strk20TransportOnly ? 150 : 240) : 120,
      transportOnly: strk20TransportOnly || undefined,
      route:
        privacyProvider === 'strk20'
          ? [
              cctpChainName(input.sourceChainId),
              'Circle CCTP',
              strk20TransportOnly ? 'Starknet (transport only — NOT private)' : 'STRK20 pool (Starknet)',
              'Circle CCTP',
              cctpChainName(input.destChainId),
            ]
          : privacyProvider === 'arc'
          ? [
              cctpChainName(input.sourceChainId),
              ...(input.sourceChainId === hubChainId ? [] : ['Circle CCTP']),
              'Erebuz Privacy Pool (Arc)',
              ...(input.destChainId === hubChainId ? [] : ['Circle CCTP']),
              cctpChainName(input.destChainId),
            ]
          : [cctpChainName(input.sourceChainId), 'Railgun', cctpChainName(input.destChainId)],
    };
  }

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
    privacyProvider,
    symbol,
    decimals: source.decimals,
    destSymbol,
    destDecimals: dest.decimals,
    sourceChainId: input.sourceChainId,
    destChainId: input.destChainId,
    hubChainId,
    amount: amount.toString(),
    feeAmount: fee.toString(),
    // Relay's expectedOutput already nets bridge/protocol costs, so there's no
    // separate user-borne bridge/privacy fee to itemize here.
    bridgeFeeAmount: '0',
    privacyFeeAmount: '0',
    quotedOutputAmount: quotedOutput.toString(),
    amountInUsd,
    quotedOutputUsd,
    feeUsd,
    bridgeFeeUsd: null,
    privacyFeeUsd: null,
    etaSeconds,
    route,
  };
}
