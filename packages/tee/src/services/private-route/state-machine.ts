// Per-route state machine. One idempotent step per call; the monitor invokes it.
//
// Flow: AWAITING_DEPOSIT -> BRIDGING_IN -> RECEIVED_ON_HUB -> SHIELDED
//       -> UNSHIELD_SENT -> BRIDGING_OUT -> COMPLETED  (or FAILED)
//
// Defensive: recoverable "not ready" conditions (Relay still bridging, AA or
// Railgun not configured) leave the route unchanged for the next tick; only hard
// failures mark it FAILED.

import { getAddress, type Address } from 'viem';
import { logger } from '../../managers/log';
import { PrivateRouteModel, type PrivateRoute, type PrivateRouteStatus } from '../../database/models/private-route';
import { getRelayDepositAddress, getRelayStatus, isRelayFilled, isRelayFailed, resolveCurrency, RELAY_NATIVE } from '../relay';
import { executeBatch, isAaReady } from '../aa';
import { isRailgunReady, buildShieldCalls, unshieldERC20 } from '../railgun';
import { chainManager } from '../../managers/chain';

async function set(routeId: string, status: PrivateRouteStatus, extra?: Record<string, string | null>) {
  await PrivateRouteModel.update(routeId, { status, ...(extra ?? {}) });
}

export async function advancePrivateRoute(route: PrivateRoute): Promise<void> {
  const { id, hubChainId } = route;
  const token = route.tokenAddress as Address;

  switch (route.status) {
    // ---- Bridge in: wait for Relay to fill the hub account ----
    case 'AWAITING_DEPOSIT':
    case 'BRIDGING_IN': {
      if (!route.leg1RequestId) return;
      const s = await getRelayStatus(route.leg1RequestId);
      if (!s) return;
      if (isRelayFailed(s.status)) return void (await set(id, 'FAILED', { error: `Relay leg-1 ${s.status}` }));
      if (isRelayFilled(s.status)) await set(id, 'RECEIVED_ON_HUB');
      else if (route.status === 'AWAITING_DEPOSIT') await set(id, 'BRIDGING_IN');
      return;
    }

    // ---- Shield: SA executes a batched [approve, shield] UserOp ----
    case 'RECEIVED_ON_HUB': {
      if (!isAaReady(hubChainId)) return pause(id, `AA not ready on ${hubChainId}`);
      if (!isRailgunReady()) return pause(id, 'Railgun not ready (privacy leg disabled)');
      const received = await chainManager.getTokenBalance(hubChainId, getAddress(route.hubAccount!), token);
      if (received <= 0n) return; // funds not settled on the hub yet
      // Shield everything received. Our fee/margin is realized as the surplus left
      // in the shielded pool after we deliver the quoted output on leg-2.
      const { calls } = await buildShieldCalls({ chainId: hubChainId, tokenAddress: token, amount: received });
      const { txHash } = await executeBatch(hubChainId, id, calls);
      await set(id, 'SHIELDED', { shieldTx: txHash });
      return;
    }

    // ---- Unshield: quote Relay leg-2, then unshield to that deposit address ----
    case 'SHIELDED': {
      if (!isRailgunReady()) return;
      // Deliver the DESTINATION token (may differ from the shielded source token).
      const destSymbol = route.destTokenSymbol || route.tokenSymbol;
      const dest = route.destTokenAddress
        ? { address: route.destTokenAddress }
        : await resolveCurrency(route.destChainId, destSymbol);
      if (!dest) {
        return void (await set(id, 'FAILED', { error: `unsupported token ${destSymbol} on dest ${route.destChainId}` }));
      }
      // Deliver EXACTLY the quoted output to the user (EXACT_OUTPUT). Relay tells
      // us the input we must unshield to the leg-2 deposit address; any surplus
      // stays in the shielded pool as our margin.
      const leg2 = await getRelayDepositAddress({
        user: route.userDestinationAddress,
        recipient: route.userDestinationAddress,
        originChainId: hubChainId,
        destinationChainId: route.destChainId,
        originCurrency: token, // hub token address
        destinationCurrency: dest.address,
        amount: route.quotedOutputAmount,
        tradeType: 'EXACT_OUTPUT',
        strict: true,
        refundTo: RELAY_NATIVE,
      });
      if (!leg2 || !leg2.requiredInputAmount) return;
      const { txHash } = await unshieldERC20({
        chainId: hubChainId,
        tokenAddress: token,
        amount: BigInt(leg2.requiredInputAmount),
        toAddress: leg2.depositAddress,
        gasPrivateKey: process.env.PRIVATE_KEY as string,
      });
      await set(id, 'UNSHIELD_SENT', {
        leg2RequestId: leg2.requestId,
        leg2DepositAddress: leg2.depositAddress,
        unshieldTx: txHash,
      });
      return;
    }

    // ---- Bridge out: wait for Relay leg-2 to deliver to the user ----
    case 'UNSHIELD_SENT':
    case 'BRIDGING_OUT': {
      if (!route.leg2RequestId) return;
      const s = await getRelayStatus(route.leg2RequestId);
      if (!s) return;
      if (isRelayFailed(s.status)) return void (await set(id, 'FAILED', { error: `Relay leg-2 ${s.status}` }));
      if (isRelayFilled(s.status)) await set(id, 'COMPLETED');
      else if (route.status === 'UNSHIELD_SENT') await set(id, 'BRIDGING_OUT');
      return;
    }

    default:
      return; // terminal (COMPLETED / FAILED)
  }
}

function pause(routeId: string, reason: string): void {
  logger.warn(`Route ${routeId} paused: ${reason}`, 'PrivateRoute');
}
