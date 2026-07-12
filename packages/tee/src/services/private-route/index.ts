// Private Route orchestrator
//
// Drives the /private-route flow: bridge in via Relay to a TEE-owned hub smart
// account on Arbitrum, shield -> unshield through Railgun (privacy break), then
// bridge out via Relay to the user's destination address.
//
// This module currently implements route creation (leg-1 Relay deposit address).
// The state machine (advancePrivateRoute) + background poller + Railgun shield/
// unshield are added in a follow-up step.

import { parseUnits, isAddress, getAddress, type Address } from 'viem';
import { logger } from '../../managers/log';
import {
  PrivateRouteModel,
  type PrivateRoute,
  type PrivateRouteStatus,
  TERMINAL_STATUSES,
} from '../../database/models/private-route';
import { getRelayDepositAddress, getRelayStatus, isRelayFilled, isRelayFailed, RELAY_NATIVE } from '../relay';
import { SUPPORTED_TOKENS } from '../near-intents';
import { computeTeeOwnedHubAccount } from '../../utils/hub-account';
import { transferFromHubAccount } from '../../utils/hub-transfer';
import { isRailgunReady, shieldERC20, unshieldERC20 } from '../railgun';
import { getEIP712Signer } from '../eip712-signer';
import { chainManager } from '../../managers/chain';
import { PRIVACY_HUB_CHAIN_ID } from '../../config/global-config';

export interface CreatePrivateRouteInput {
  sourceChainId: number;
  destChainId: number;
  /** Human-readable amount, e.g. "5" (USDC). */
  amount: string;
  /** Where the user ultimately receives funds on the destination chain. */
  userDestinationAddress: string;
  /** Token symbol; only USDC supported in v1. */
  tokenSymbol?: string;
}

export interface CreatePrivateRouteResult {
  routeId: string;
  status: string;
  /** Address the user sends `amount` of the source token to (Relay leg-1). */
  depositAddress: string;
  /** TEE-owned hub account the leg-1 funds are delivered to on Arbitrum. */
  hubAccount: string;
  /** Whether hubAccount is a real per-route smart account (module configured) vs the TEE EOA fallback. */
  hubIsSmartAccount: boolean;
  requestId: string;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  amount: string;
}

function usdcAddress(chainId: number): string | null {
  return SUPPORTED_TOKENS[chainId]?.USDC?.address ?? null;
}

function newRouteId(): string {
  return `route_${crypto.randomUUID()}`;
}

/**
 * Create a private route: derive the hub account and request a Relay leg-1
 * deposit address (source -> Arbitrum hub SA). Returns the deposit address for
 * the user to send funds to. Does NOT block on the transfer completing.
 */
export async function createPrivateRoute(
  input: CreatePrivateRouteInput
): Promise<CreatePrivateRouteResult> {
  const tokenSymbol = (input.tokenSymbol ?? 'USDC').toUpperCase();
  if (tokenSymbol !== 'USDC') {
    throw new Error('Invalid token: only USDC is supported in v1');
  }

  const hubChainId = PRIVACY_HUB_CHAIN_ID;

  // Validate chains
  const sourceUsdc = usdcAddress(input.sourceChainId);
  const hubUsdc = usdcAddress(hubChainId);
  const destUsdc = usdcAddress(input.destChainId);
  if (!sourceUsdc) throw new Error(`Unsupported sourceChainId ${input.sourceChainId}`);
  if (!hubUsdc) throw new Error(`Unsupported hub chain ${hubChainId}`);
  if (!destUsdc) throw new Error(`Unsupported destChainId ${input.destChainId}`);

  // Validate destination address
  if (!input.userDestinationAddress || !isAddress(input.userDestinationAddress)) {
    throw new Error('Invalid userDestinationAddress');
  }

  // Amount (USDC = 6 decimals)
  let amountSmallest: bigint;
  try {
    amountSmallest = parseUnits(input.amount, 6);
  } catch {
    throw new Error('Invalid amount');
  }
  if (amountSmallest <= 0n) throw new Error('Invalid amount: must be greater than 0');

  const routeId = newRouteId();
  logger.info(
    `Creating private route ${routeId}: ${input.amount} USDC ${input.sourceChainId}->${input.destChainId} via hub ${hubChainId}`,
    'PrivateRoute'
  );

  // Derive the TEE-owned hub account (Relay leg-1 recipient).
  const hub = await computeTeeOwnedHubAccount(hubChainId, routeId);
  if (!hub.success) {
    throw new Error(`Failed to derive hub account: ${hub.error ?? 'unknown'}`);
  }
  const hubAccount = getAddress(hub.address);

  // Relay leg-1: source -> hub SA on Arbitrum.
  const leg1 = await getRelayDepositAddress({
    user: hubAccount,
    recipient: hubAccount,
    originChainId: input.sourceChainId,
    destinationChainId: hubChainId,
    originCurrency: sourceUsdc,
    destinationCurrency: hubUsdc,
    amount: amountSmallest.toString(),
    tradeType: 'EXACT_INPUT',
    refundTo: RELAY_NATIVE,
  });
  if (!leg1) {
    throw new Error('Failed to get Relay deposit address for leg-1');
  }

  await PrivateRouteModel.create({
    id: routeId,
    status: 'AWAITING_DEPOSIT',
    sourceChainId: input.sourceChainId,
    destChainId: input.destChainId,
    hubChainId,
    tokenAddress: hubUsdc,
    amount: amountSmallest.toString(),
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
    hubIsSmartAccount: hub.isSmartAccount,
    requestId: leg1.requestId,
    sourceChainId: input.sourceChainId,
    destChainId: input.destChainId,
    hubChainId,
    amount: amountSmallest.toString(),
  };
}

/** Fetch persisted route state (for the status endpoint). */
export async function getPrivateRoute(routeId: string): Promise<PrivateRoute | null> {
  return PrivateRouteModel.findById(routeId);
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

function teeEoa(): Address {
  return getEIP712Signer().getAddress();
}

async function set(routeId: string, status: PrivateRouteStatus, extra?: Record<string, string | null>) {
  await PrivateRouteModel.update(routeId, { status, ...(extra ?? {}) });
}

/**
 * Advance a single route by one step based on its status. Idempotent and
 * defensive: recoverable "not ready" conditions (Relay still bridging, module
 * not deployed, Railgun disabled) leave the route unchanged for the next tick;
 * only hard errors mark it FAILED.
 */
export async function advancePrivateRoute(route: PrivateRoute): Promise<void> {
  const { id, hubChainId, tokenAddress } = route;
  const token = tokenAddress as Address;
  const amount = BigInt(route.amount);

  switch (route.status) {
    case 'AWAITING_DEPOSIT':
    case 'BRIDGING_IN': {
      if (!route.leg1RequestId) return;
      const s = await getRelayStatus(route.leg1RequestId);
      if (!s) return; // transient; retry next tick
      if (isRelayFailed(s.status)) {
        await set(id, 'FAILED', { error: `Relay leg-1 ${s.status}` });
        return;
      }
      if (isRelayFilled(s.status)) {
        await set(id, 'RECEIVED_ON_HUB');
      } else if (route.status === 'AWAITING_DEPOSIT') {
        await set(id, 'BRIDGING_IN');
      }
      return;
    }

    case 'RECEIVED_ON_HUB': {
      // Move funds from the hub account to the TEE EOA (the shield source).
      const hub = getAddress(route.hubAccount ?? teeEoa());
      const eoa = teeEoa();
      if (hub.toLowerCase() === eoa.toLowerCase()) {
        // EOA-fallback hub: funds already at the TEE EOA, nothing to extract.
        await set(id, 'EXTRACTED');
        return;
      }
      const received = await chainManager.getTokenBalance(hubChainId, hub, token);
      if (received <= 0n) return; // funds not settled yet
      const res = await transferFromHubAccount(hubChainId, hub, token, received, eoa);
      if (res.notReady) {
        logger.warn(`Route ${id}: transfer module not deployed on ${hubChainId}; pausing at RECEIVED_ON_HUB`, 'PrivateRoute');
        return; // pause until module is configured
      }
      if (!res.success) {
        await set(id, 'FAILED', { error: res.error ?? 'hub transfer failed' });
        return;
      }
      await set(id, 'EXTRACTED');
      return;
    }

    case 'EXTRACTED': {
      // Shield the funds now sitting at the TEE EOA into Railgun.
      if (!isRailgunReady()) {
        logger.warn(`Route ${id}: Railgun not ready; pausing at EXTRACTED (privacy leg disabled)`, 'PrivateRoute');
        return;
      }
      const eoa = teeEoa();
      const bal = await chainManager.getTokenBalance(hubChainId, eoa, token);
      if (bal <= 0n) return;
      const pk = process.env.PRIVATE_KEY as string;
      const { txHash } = await shieldERC20({ chainId: hubChainId, tokenAddress: token, amount: bal, fromPrivateKey: pk });
      await set(id, 'SHIELDED', { shieldTx: txHash });
      return;
    }

    case 'SHIELDED': {
      if (!isRailgunReady()) return;
      // Determine unshield amount from shielded balance would require a balance
      // scan; for wiring we unshield the requested-through amount minus is handled
      // by Railgun. Get a Relay leg-2 deposit address for hub -> destination.
      const hubUsdc = SUPPORTED_TOKENS[hubChainId]?.USDC?.address as string;
      const destUsdc = SUPPORTED_TOKENS[route.destChainId]?.USDC?.address as string;
      const leg2 = await getRelayDepositAddress({
        user: route.userDestinationAddress,
        recipient: route.userDestinationAddress,
        originChainId: hubChainId,
        destinationChainId: route.destChainId,
        originCurrency: hubUsdc,
        destinationCurrency: destUsdc,
        amount: amount.toString(),
        tradeType: 'EXACT_INPUT',
        refundTo: RELAY_NATIVE,
      });
      if (!leg2) return; // retry next tick
      const pk = process.env.PRIVATE_KEY as string;
      const { txHash } = await unshieldERC20({
        chainId: hubChainId,
        tokenAddress: token,
        amount,
        toAddress: leg2.depositAddress,
        gasPrivateKey: pk,
      });
      await set(id, 'UNSHIELD_SENT', {
        leg2RequestId: leg2.requestId,
        leg2DepositAddress: leg2.depositAddress,
        unshieldTx: txHash,
      });
      return;
    }

    case 'UNSHIELD_SENT':
    case 'BRIDGING_OUT': {
      if (!route.leg2RequestId) return;
      const s = await getRelayStatus(route.leg2RequestId);
      if (!s) return;
      if (isRelayFailed(s.status)) {
        await set(id, 'FAILED', { error: `Relay leg-2 ${s.status}` });
        return;
      }
      if (isRelayFilled(s.status)) {
        await set(id, 'COMPLETED');
      } else if (route.status === 'UNSHIELD_SENT') {
        await set(id, 'BRIDGING_OUT');
      }
      return;
    }

    default:
      return; // terminal
  }
}

// ---------------------------------------------------------------------------
// Background poller (mirrors deposit-monitor's interval model)
// ---------------------------------------------------------------------------

const inFlight = new Set<string>();

async function processPrivateRoutes(): Promise<void> {
  const routes = await PrivateRouteModel.findNonTerminal();
  for (const route of routes) {
    if (inFlight.has(route.id)) continue;
    inFlight.add(route.id);
    // Fire-and-forget per route; steps (esp. unshield proofs) can be slow.
    advancePrivateRoute(route)
      .catch((err) => logger.error(`advancePrivateRoute ${route.id} failed`, 'PrivateRoute', err))
      .finally(() => inFlight.delete(route.id));
  }
}

export function startPrivateRouteMonitor(intervalMs: number): NodeJS.Timeout {
  logger.info(`Starting private-route monitor (interval ${intervalMs}ms)`, 'PrivateRoute');
  processPrivateRoutes().catch((err) => logger.error('processPrivateRoutes failed', 'PrivateRoute', err));
  return setInterval(() => {
    processPrivateRoutes().catch((err) => logger.error('processPrivateRoutes failed', 'PrivateRoute', err));
  }, intervalMs);
}

export function stopPrivateRouteMonitor(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  logger.info('Stopped private-route monitor', 'PrivateRoute');
}

export { TERMINAL_STATUSES };
