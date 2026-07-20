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
import { isRailgunReady, buildShieldCalls, shieldFromEOA, unshieldERC20 } from '../railgun';
import { buildCctpBurnCalls, cctpMint, cctpTryAttestation, cctpUsdc } from '../cctp';
import { BRIDGE_PROVIDER } from '../../config/global-config';
import { chainManager } from '../../managers/chain';

const CCTP = BRIDGE_PROVIDER === 'cctp';

async function set(routeId: string, status: PrivateRouteStatus, extra?: Record<string, string | null>) {
  await PrivateRouteModel.update(routeId, { status, ...(extra ?? {}) });
}

export async function advancePrivateRoute(route: PrivateRoute): Promise<void> {
  const { id, hubChainId } = route;
  const token = route.tokenAddress as Address;

  switch (route.status) {
    // ---- Bridge in: user's USDC -> hub. CCTP (burn/mint) or Relay. ----
    case 'AWAITING_DEPOSIT':
    case 'BRIDGING_IN': {
      if (CCTP) {
        const sourceUsdc = cctpUsdc(route.sourceChainId) as Address;
        if (!route.leg1RequestId) {
          // Not burned yet: wait for the user's USDC at the source smart account,
          // then CCTP-burn it to the hub smart account.
          const bal = await chainManager.getTokenBalance(
            route.sourceChainId,
            getAddress(route.leg1DepositAddress!),
            sourceUsdc
          );
          if (bal <= 0n) return; // deposit not arrived yet
          const calls = buildCctpBurnCalls({
            destChainId: hubChainId,
            usdc: sourceUsdc,
            amount: bal,
            mintRecipient: getAddress(route.hubAccount!),
          });
          const { txHash } = await executeBatch(route.sourceChainId, id, calls);
          await set(id, 'BRIDGING_IN', { leg1RequestId: txHash });
          return;
        }
        // Burned: mint on the hub once Circle attests. Hub gets funded on mint, so
        // a positive hub balance means we already minted -> advance.
        const hubUsdc = cctpUsdc(hubChainId) as Address;
        const hubBal = await chainManager.getTokenBalance(hubChainId, getAddress(route.hubAccount!), hubUsdc);
        if (hubBal > 0n) return void (await set(id, 'RECEIVED_ON_HUB'));
        const att = await cctpTryAttestation({ sourceChainId: route.sourceChainId, burnTxHash: route.leg1RequestId });
        if (!att) return; // attestation not ready
        await cctpMint({
          destChainId: hubChainId,
          message: att.message,
          attestation: att.attestation,
          signerPrivateKey: process.env.PRIVATE_KEY as string,
        });
        await set(id, 'RECEIVED_ON_HUB');
        return;
      }
      // ---- Relay leg-1 ----
      if (!route.leg1RequestId) return;
      const s = await getRelayStatus(route.leg1RequestId);
      if (!s) return;
      if (isRelayFailed(s.status)) return void (await set(id, 'FAILED', { error: `Relay leg-1 ${s.status}` }));
      if (isRelayFilled(s.status)) await set(id, 'RECEIVED_ON_HUB');
      else if (route.status === 'AWAITING_DEPOSIT') await set(id, 'BRIDGING_IN');
      return;
    }

    // ---- Shield: SA (AA hub) or EOA (fallback hub) shields the received funds ----
    case 'RECEIVED_ON_HUB': {
      const aaReady = isAaReady(hubChainId);
      // EOA-hub fallback needs the signer key; AA hub needs the Nexus stack.
      if (!aaReady && !process.env.PRIVATE_KEY) return pause(id, `no hub executor on ${hubChainId}`);
      if (!isRailgunReady()) return pause(id, 'Railgun not ready (privacy leg disabled)');
      const received = await chainManager.getTokenBalance(hubChainId, getAddress(route.hubAccount!), token);
      if (received <= 0n) return; // funds not settled on the hub yet
      // Shield everything received. Our fee/margin is realized as the surplus left
      // in the shielded pool after we deliver the quoted output on leg-2.
      let txHash: string;
      if (aaReady) {
        // Production hub: smart account executes a batched [approve, shield] UserOp.
        const { calls } = await buildShieldCalls({ chainId: hubChainId, tokenAddress: token, amount: received });
        ({ txHash } = await executeBatch(hubChainId, id, calls));
      } else {
        // Fallback hub (e.g. Sepolia test): shield directly from the TEE EOA.
        ({ txHash } = await shieldFromEOA({
          chainId: hubChainId,
          tokenAddress: token,
          amount: received,
          signerPrivateKey: process.env.PRIVATE_KEY as string,
        }));
      }
      await set(id, 'SHIELDED', { shieldTx: txHash });
      return;
    }

    // ---- Unshield the quoted output, then bridge out (CCTP or Relay) ----
    case 'SHIELDED': {
      if (!isRailgunReady()) return;
      if (CCTP) {
        // Unshield the quoted output back to the hub smart account; leg-2 CCTP-burns
        // it to the recipient on the destination chain (handled in BRIDGING_OUT).
        const hubUsdc = cctpUsdc(hubChainId);
        const { txHash } = await unshieldERC20({
          chainId: hubChainId,
          tokenAddress: hubUsdc,
          amount: BigInt(route.quotedOutputAmount),
          toAddress: getAddress(route.hubAccount!),
          gasPrivateKey: process.env.PRIVATE_KEY as string,
        });
        await set(id, 'UNSHIELD_SENT', { unshieldTx: txHash });
        return;
      }
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

    // ---- Bridge out: hub -> recipient. CCTP (burn/mint) or Relay. ----
    case 'UNSHIELD_SENT':
    case 'BRIDGING_OUT': {
      if (CCTP) {
        const hubUsdc = cctpUsdc(hubChainId) as Address;
        if (!route.leg2RequestId) {
          // Not burned yet: wait for the unshielded USDC on the hub SA, then
          // CCTP-burn it to the recipient on the destination chain.
          const bal = await chainManager.getTokenBalance(hubChainId, getAddress(route.hubAccount!), hubUsdc);
          if (bal <= 0n) return; // unshield not settled yet
          const calls = buildCctpBurnCalls({
            destChainId: route.destChainId,
            usdc: cctpUsdc(hubChainId),
            amount: bal,
            mintRecipient: route.userDestinationAddress,
          });
          const { txHash } = await executeBatch(hubChainId, id, calls);
          await set(id, 'BRIDGING_OUT', { leg2RequestId: txHash });
          return;
        }
        // Burned: mint on the destination once attested (then the recipient has USDC).
        const att = await cctpTryAttestation({ sourceChainId: hubChainId, burnTxHash: route.leg2RequestId });
        if (!att) return; // attestation not ready
        try {
          await cctpMint({
            destChainId: route.destChainId,
            message: att.message,
            attestation: att.attestation,
            signerPrivateKey: process.env.PRIVATE_KEY as string,
          });
        } catch (e) {
          // Nonce may already be consumed (minted on a prior tick) — treat as done.
          logger.warn(`CCTP leg-2 mint (may be already minted): ${String((e as Error)?.message || e)}`, 'PrivateRoute');
        }
        await set(id, 'COMPLETED');
        return;
      }
      // ---- Relay leg-2 ----
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
