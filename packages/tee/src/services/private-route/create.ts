// Route creation: resolve the token across chains (via Relay's currencies API),
// derive the TEE-owned hub account, and request a Relay leg-1 deposit address.
// Returns immediately with the address for the user to fund; the background
// monitor drives the rest.

import { isAddress, getAddress } from 'viem';
import { logger } from '../../managers/log';
import { PrivateRouteModel, type PrivateRoute } from '../../database/models/private-route';
import { getRelayChains, getRelayDepositAddress, getRelayQuote, RELAY_NATIVE } from '../relay';
import { deriveHubAddress, isAaReady } from '../aa';
import { computeServiceFee } from './fee';
import { resolveRouteTokens } from './shared';
import type { CreatePrivateRouteInput, CreatePrivateRouteResult } from './types';

function newRouteId(): string {
  return `route_${crypto.randomUUID()}`;
}

export async function createPrivateRoute(input: CreatePrivateRouteInput): Promise<CreatePrivateRouteResult> {
  // Validate the recipient against the destination chain's VM. EVM chains get a
  // strict checksum check; non-EVM chains (Solana, Tron, TON, ...) just need a
  // plausible non-empty address, and Relay validates the exact format on leg-2.
  const destChain = (await getRelayChains()).find((c) => c.chainId === input.destChainId);
  const destIsEvm = !destChain || (destChain.vmType ?? 'evm') === 'evm';
  const recipient = (input.userDestinationAddress ?? '').trim();
  const recipientValid = destIsEvm ? isAddress(recipient) : /^[A-Za-z0-9:._-]{8,120}$/.test(recipient);
  if (!recipientValid) throw new Error('Invalid userDestinationAddress');
  const storedRecipient = destIsEvm ? getAddress(recipient) : recipient;

  // Source is bridged/swapped into the canonical hub token, shielded, then
  // swapped/bridged out to the destination token. Relay is the coverage limiter.
  const { symbol, destSymbol, hubSymbol, hubChainId, amount, source, hub, dest } =
    await resolveRouteTokens(input);

  const routeId = newRouteId();
  logger.info(
    `Creating private route ${routeId}: ${input.amount} ${symbol} ${input.sourceChainId} -> ${destSymbol} ${input.destChainId} via ${hubSymbol} hub ${hubChainId}`,
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
  const hubAmount = leg1.expectedOutputAmount ? BigInt(leg1.expectedOutputAmount) : amount;

  // Gross output in the DESTINATION token: bridge/swap the hub amount to the
  // destination token. Same-asset routes deliver it 1:1.
  const sameAsset = hub.address.toLowerCase() === dest.address.toLowerCase() && hub.decimals === dest.decimals;
  let grossOutput: bigint;
  let outputUsd: number | null;
  if (sameAsset) {
    grossOutput = hubAmount;
    outputUsd = leg1.amountInUsd ? Number(leg1.amountInUsd) : null;
  } else {
    const leg2Quote = await getRelayQuote({
      originChainId: hubChainId,
      destinationChainId: input.destChainId,
      originCurrency: hub.address,
      destinationCurrency: dest.address,
      amount: hubAmount.toString(),
      tradeType: 'EXACT_INPUT',
    });
    if (!leg2Quote?.expectedOutputAmount) throw new Error(`Route unavailable for ${symbol} to ${destSymbol}`);
    grossOutput = BigInt(leg2Quote.expectedOutputAmount);
    outputUsd = leg2Quote.outputUsd ? Number(leg2Quote.outputUsd) : null;
  }

  // Fee = max($ floor, bps) charged on the OUTPUT (destination token). It covers
  // Railgun 0.5% + Relay legs + gas plus margin; we deliver grossOutput - fee.
  const fee = computeServiceFee(grossOutput, outputUsd);
  if (fee >= grossOutput) throw new Error('Amount too small: fee would exceed the output');
  const quotedOutput = grossOutput - fee;
  if (quotedOutput <= 0n) throw new Error('Amount too small for this route');

  await PrivateRouteModel.create({
    id: routeId,
    status: 'AWAITING_DEPOSIT',
    sourceChainId: input.sourceChainId,
    destChainId: input.destChainId,
    hubChainId,
    tokenSymbol: hubSymbol, // the shielded hub token (matches tokenAddress)
    tokenAddress: hub.address,
    destTokenSymbol: destSymbol,
    destTokenAddress: dest.address,
    amount: amount.toString(),
    feeAmount: fee.toString(),
    quotedOutputAmount: quotedOutput.toString(),
    userDestinationAddress: storedRecipient,
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
