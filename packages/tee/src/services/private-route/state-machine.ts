// Per-route state machine. One idempotent step per call; the monitor invokes it.
//
// Flow: AWAITING_DEPOSIT -> BRIDGING_IN -> RECEIVED_ON_HUB -> SHIELDED
//       -> UNSHIELD_SENT -> BRIDGING_OUT -> COMPLETED  (or FAILED)
//
// Defensive: recoverable "not ready" conditions (Relay still bridging, AA or
// Railgun not configured) leave the route unchanged for the next tick; only hard
// failures mark it FAILED.

import { getAddress, encodeFunctionData, type Address } from 'viem';
import { logger } from '../../managers/log';
import { PrivateRouteModel, type PrivateRoute, type PrivateRouteStatus } from '../../database/models/private-route';
import { getRelayDepositAddress, getRelayStatus, isRelayFilled, isRelayFailed, resolveCurrency, RELAY_NATIVE } from '../relay';
import { executeBatch, isAaReady } from '../aa';
import { isRailgunReady, buildShieldCalls, shieldFromEOA, unshieldERC20, waitForShieldedBalance } from '../railgun';
import { buildCctpBurnCalls, cctpMint, cctpTryAttestation, cctpUsdc } from '../cctp';
import { BRIDGE_PROVIDER } from '../../config/global-config';
import { chainManager } from '../../managers/chain';
import {
  createArcPrivacyPayload,
  clearArcWithdrawal,
  depositIntoArcPrivacyPool,
  parseArcPrivacyPayload,
  prepareArcPoolWithdrawal,
  serializeArcPrivacyPayload,
  submitArcPoolWithdrawal,
} from '../arc-privacy-pool';

const DEFAULT_CCTP = BRIDGE_PROVIDER === 'cctp';

// Auto-cancel a route that's still AWAITING_DEPOSIT after this window (no funds sent).
const DEPOSIT_EXPIRY_MS = Number(process.env.PRIVATE_ROUTE_DEPOSIT_EXPIRY_MS) || 5 * 60 * 1000;

async function set(routeId: string, status: PrivateRouteStatus, extra?: Record<string, string | null>) {
  await PrivateRouteModel.update(routeId, { status, ...(extra ?? {}) });
}

export async function advancePrivateRoute(route: PrivateRoute): Promise<void> {
  const { id, hubChainId } = route;
  const token = route.tokenAddress as Address;
  const cctp = DEFAULT_CCTP || route.privacyProvider === 'arc';

  switch (route.status) {
    // ---- Bridge in: user's USDC -> hub. CCTP (burn/mint) or Relay. ----
    case 'AWAITING_DEPOSIT':
    case 'BRIDGING_IN': {
      if (cctp) {
        const sourceUsdc = cctpUsdc(route.sourceChainId) as Address;
        // Same-chain funding: the source account and hub account are the same
        // deterministic account, so no CCTP burn/attestation is required.
        if (route.sourceChainId === hubChainId) {
          const balance = await chainManager.getTokenBalance(
            hubChainId,
            getAddress(route.hubAccount!),
            sourceUsdc
          );
          if (balance > 0n) return void (await set(id, 'RECEIVED_ON_HUB'));
          if (route.status === 'AWAITING_DEPOSIT' && Date.now() - route.createdAt.getTime() > DEPOSIT_EXPIRY_MS) {
            return void (await set(id, 'FAILED', {
              error: 'Deposit window expired — no funds received within 5 minutes. Start a new transfer.',
            }));
          }
          return;
        }
        if (!route.leg1RequestId) {
          // Not burned yet: wait for the user's USDC at the source smart account,
          // then CCTP-burn it to the hub smart account.
          const bal = await chainManager.getTokenBalance(
            route.sourceChainId,
            getAddress(route.leg1DepositAddress!),
            sourceUsdc
          );
          if (bal <= 0n) {
            // Expire the intent if the user never funds it within the deposit window.
            if (route.status === 'AWAITING_DEPOSIT' && Date.now() - route.createdAt.getTime() > DEPOSIT_EXPIRY_MS) {
              return void (await set(id, 'FAILED', {
                error: 'Deposit window expired — no funds received within 5 minutes. Start a new transfer.',
              }));
            }
            return; // deposit not arrived yet
          }
          const calls = buildCctpBurnCalls({
            sourceChainId: route.sourceChainId,
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
      if (route.privacyProvider === 'arc') {
        if (!route.hubAccount) return pause(id, 'Arc privacy route has no hub account');
        const received = await chainManager.getTokenBalance(hubChainId, getAddress(route.hubAccount), token);
        if (received <= 0n) return;

        // Persist note secrets before broadcasting. If the process stops after
        // the UserOp lands, the next tick recovers the receipt by precommitment.
        if (!route.privacyPayload) {
          const payload = createArcPrivacyPayload();
          await set(id, 'RECEIVED_ON_HUB', { privacyPayload: serializeArcPrivacyPayload(payload) });
          return;
        }
        const payload = parseArcPrivacyPayload(route.privacyPayload);
        const confirmed = payload.deposit
          ? payload
          : await depositIntoArcPrivacyPool(route, payload, received);
        await set(id, 'POOL_DEPOSITED', {
          privacyPayload: serializeArcPrivacyPayload(confirmed),
          shieldTx: confirmed.deposit?.transactionHash ?? null,
        });
        return;
      }
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

    // ---- Erebuz Arc pool: wait for ASP approval, prove, then withdraw ----
    case 'POOL_DEPOSITED': {
      if (route.privacyProvider !== 'arc') {
        return void (await set(id, 'FAILED', { error: 'POOL_DEPOSITED is only valid for Arc privacy routes' }));
      }
      let payload = parseArcPrivacyPayload(route.privacyPayload);
      if (!payload.withdrawal) {
        const prepared = await prepareArcPoolWithdrawal(route, payload);
        if (!prepared) return; // ASP has not approved/published this deposit yet
        payload = prepared;
        await set(id, 'POOL_DEPOSITED', { privacyPayload: serializeArcPrivacyPayload(payload) });
        return;
      }
      let txHash: `0x${string}`;
      try {
        txHash = await submitArcPoolWithdrawal(route, payload);
      } catch (error) {
        if (error instanceof Error && error.message.includes('roots changed after proof generation')) {
          await set(id, 'POOL_DEPOSITED', {
            privacyPayload: serializeArcPrivacyPayload(clearArcWithdrawal(payload)),
          });
          return;
        }
        throw error;
      }
      await set(id, 'UNSHIELD_SENT', {
        privacyPayload: serializeArcPrivacyPayload(payload),
        unshieldTx: txHash,
      });
      return;
    }

    // ---- Unshield the quoted output, then bridge out (CCTP or Relay) ----
    case 'SHIELDED': {
      if (!isRailgunReady()) return;
      // The shield commitment must be scanned into the merkletree AND POI-Valid on
      // our list before it's spendable. This refreshes balances, pulls the shield's
      // POI status from the node, and generates the wallet proof, returning once the
      // funds are spendable. Until then it's not-ready -> leave SHIELDED for a retry.
      // CCTP unshields the GROSS (amount − our service fee); the Railgun unshield
      // fee + CCTP dest-leg fee then bring it down to the quoted net (see fee.ts,
      // computeCctpRouteFees). Relay unshields the leg-2 required input computed below.
      const cctpUnshieldAmount = BigInt(route.amount) - BigInt(route.feeAmount);
      const unshieldToken = cctp ? cctpUsdc(hubChainId) : token;
      const minSpendable = cctp ? cctpUnshieldAmount : BigInt(route.quotedOutputAmount);
      const { spendable } = await waitForShieldedBalance({
        chainId: hubChainId,
        tokenAddress: unshieldToken,
        minAmount: minSpendable,
        timeoutMs: 240_000,
      });
      if (spendable < minSpendable) return; // not scanned / POI-Valid yet; retry next tick
      if (cctp) {
        // Unshield the gross to the hub smart account; leg-2 CCTP-burns it to the
        // recipient on the destination chain (handled in BRIDGING_OUT).
        const hubUsdc = cctpUsdc(hubChainId);
        const { txHash } = await unshieldERC20({
          chainId: hubChainId,
          tokenAddress: hubUsdc,
          amount: cctpUnshieldAmount,
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
      if (cctp) {
        const hubUsdc = cctpUsdc(hubChainId) as Address;
        // Same-chain delivery: when the destination IS the hub chain there is no
        // CCTP hop (CCTP cannot send within a single domain, which left routes
        // wedged in BRIDGING_OUT waiting for an attestation that never comes).
        // Transfer the unshielded USDC straight from the hub SA to the recipient.
        if (route.destChainId === hubChainId) {
          const bal = await chainManager.getTokenBalance(hubChainId, getAddress(route.hubAccount!), hubUsdc);
          if (bal <= 0n) return void (await set(id, 'COMPLETED'));
          const data = encodeFunctionData({
            abi: [
              {
                type: 'function',
                name: 'transfer',
                stateMutability: 'nonpayable',
                inputs: [
                  { name: 'to', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
                outputs: [{ type: 'bool' }],
              },
            ],
            functionName: 'transfer',
            args: [getAddress(route.userDestinationAddress), bal],
          });
          const { txHash } = await executeBatch(hubChainId, id, [{ to: hubUsdc, data }]);
          await set(id, 'COMPLETED', { leg2RequestId: txHash });
          return;
        }
        if (!route.leg2RequestId) {
          // Not burned yet: wait for the unshielded USDC on the hub SA, then
          // CCTP-burn it to the recipient on the destination chain.
          const bal = await chainManager.getTokenBalance(hubChainId, getAddress(route.hubAccount!), hubUsdc);
          if (bal <= 0n) return; // unshield not settled yet
          const calls = buildCctpBurnCalls({
            sourceChainId: hubChainId,
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
