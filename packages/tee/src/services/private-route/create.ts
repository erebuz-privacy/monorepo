// Route creation: resolve the token across chains (via Relay's currencies API),
// derive the TEE-owned hub account, and request a Relay leg-1 deposit address.
// Returns immediately with the address for the user to fund; the background
// monitor drives the rest.

import { isAddress, getAddress } from 'viem';
import { logger } from '../../managers/log';
import { PrivateRouteModel, type PrivateRoute } from '../../database/models/private-route';
import { getRelayDepositAddress, getRelayQuote, RELAY_NATIVE } from '../relay';
import { deriveHubAddress, isAaReady } from '../aa';
import { computeServiceFee } from './fee';
import { resolveRouteTokens } from './shared';
import type { CreatePrivateRouteInput, CreatePrivateRouteResult } from './types';

function newRouteId(): string {
  return `route_${crypto.randomUUID()}`;
}

export async function createPrivateRoute(input: CreatePrivateRouteInput): Promise<CreatePrivateRouteResult> {
  if (!input.userDestinationAddress || !isAddress(input.userDestinationAddress)) {
    throw new Error('Invalid userDestinationAddress');
  }

  // The token must be deposit-address bridgeable on all three chains. Railgun
  // shields any ERC-20 on the hub, so Relay's currency support is the limiter.
  const { symbol, destSymbol, hubChainId, amount, source, hub, dest } = await resolveRouteTokens(input);

  const routeId = newRouteId();
  logger.info(
    `Creating private route ${routeId}: ${input.amount} ${symbol} ${input.sourceChainId} -> ${destSymbol} ${input.destChainId} via hub ${hubChainId}`,
    'PrivateRoute'
  );

  // Leg-1 recipient = the per-route TEE-owned Nexus hub account.
  const hubAccount = getAddress(await deriveHubAddress(hubChainId, routeId));

  const leg1 = await getRelayDepositAddress({
    user: hubAccount,
    recipient: hubAccount,
    originChainId: input.sourceChainId,
    destinationChainId: hubChainId,
    originCurrency: source.address,
    destinationCurrency: hub.address,
    amount: amount.toString(),
    tradeType: 'EXACT_INPUT',
    refundTo: RELAY_NATIVE,
  });
  if (!leg1) throw new Error('Failed to get Relay deposit address for leg-1');

  // Fee = max($ floor, bps of amount). This is the spread between what the user
  // sends and the output we GUARANTEE to deliver; it covers actual costs
  // (Railgun 0.5% + Relay legs + gas) plus margin. We must deliver quotedOutput.
  const fee = computeServiceFee(amount, leg1.amountInUsd ? Number(leg1.amountInUsd) : null);
  if (fee >= amount) throw new Error('Amount too small: fee would exceed the amount');
  const afterFee = amount - fee;

  // Guaranteed output in the DESTINATION token: bridge the post-fee amount from
  // the hub token to the destination token. Same-asset routes degenerate to the
  // post-fee amount (leg-2 delivers it 1:1).
  const sameAsset = hub.address.toLowerCase() === dest.address.toLowerCase() && hub.decimals === dest.decimals;
  let quotedOutput: bigint;
  if (sameAsset) {
    quotedOutput = afterFee;
  } else {
    const leg2Quote = await getRelayQuote({
      originChainId: hubChainId,
      destinationChainId: input.destChainId,
      originCurrency: hub.address,
      destinationCurrency: dest.address,
      amount: afterFee.toString(),
      tradeType: 'EXACT_INPUT',
    });
    if (!leg2Quote?.expectedOutputAmount) throw new Error(`Route unavailable for ${symbol} → ${destSymbol}`);
    quotedOutput = BigInt(leg2Quote.expectedOutputAmount);
  }
  if (quotedOutput <= 0n) throw new Error('Amount too small for this route');

  await PrivateRouteModel.create({
    id: routeId,
    status: 'AWAITING_DEPOSIT',
    sourceChainId: input.sourceChainId,
    destChainId: input.destChainId,
    hubChainId,
    tokenSymbol: symbol,
    tokenAddress: hub.address,
    destTokenSymbol: destSymbol,
    destTokenAddress: dest.address,
    amount: amount.toString(),
    feeAmount: fee.toString(),
    quotedOutputAmount: quotedOutput.toString(),
    userDestinationAddress: getAddress(input.userDestinationAddress),
    hubAccount,
    leg1RequestId: leg1.requestId,
    leg1DepositAddress: leg1.depositAddress,
  });

  logger.info(`Private route ${routeId} created; leg-1 deposit address ${leg1.depositAddress}`, 'PrivateRoute');

  return {
    routeId,
    status: 'AWAITING_DEPOSIT',
    depositAddress: leg1.depositAddress,
    hubAccount,
    hubIsSmartAccount: isAaReady(hubChainId),
    requestId: leg1.requestId,
    sourceChainId: input.sourceChainId,
    destChainId: input.destChainId,
    hubChainId,
    tokenSymbol: symbol,
    destTokenSymbol: destSymbol,
    amount: amount.toString(),
    feeAmount: fee.toString(),
    quotedOutputAmount: quotedOutput.toString(),
  };
}

/** Fetch persisted route state (for the status endpoint). */
export async function getPrivateRoute(routeId: string): Promise<PrivateRoute | null> {
  return PrivateRouteModel.findById(routeId);
}
