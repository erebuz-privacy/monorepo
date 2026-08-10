import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTestClient,
  http,
  parseAbi,
  publicActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_PRIVACY_HUB_CHAIN_ID } from '../../config/global-config';
import type { PrivateRoute } from '../../database/models/private-route';
import { chainManager } from '../../managers/chain';
import { deriveHubAddress, executeBatch } from '../aa';
import {
  ARC_PRIVACY_ENTRYPOINT,
  ARC_PRIVACY_POOL,
  ARC_PRIVACY_USDC,
  buildArcPoolDepositCalls,
  createArcPrivacyPayload,
  depositIntoArcPrivacyPool,
} from '.';

const forkRpc = process.env.ARC_PRIVACY_FORK_RPC;
const ANVIL_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

void test(
  'deploys a route Nexus account and executes its Arc USDC approval on a fork',
  { skip: !forkRpc },
  async () => {
    process.env.PRIVATE_KEY = ANVIL_PRIVATE_KEY;
    process.env.ROUTE_ENCRYPTION_KEY = 'fork-integration-test-key';
    await chainManager.initialize();
    const chain = chainManager.getChain(ARC_PRIVACY_HUB_CHAIN_ID);
    if (!chain || !forkRpc) throw new Error('Arc fork is not configured');
    const viemChain = chain.getViemChain();
    const testClient = createTestClient({ chain: viemChain, mode: 'anvil', transport: http(forkRpc) })
      .extend(publicActions);
    const owner = privateKeyToAccount(ANVIL_PRIVATE_KEY);
    await testClient.setBalance({ address: owner.address, value: 10n ** 30n });

    const routeId = `route_fork_aa_${Date.now()}`;
    const hubAccount = await deriveHubAddress(ARC_PRIVACY_HUB_CHAIN_ID, routeId);
    const amount = 5_000_000n;
    await testClient.setBalance({ address: hubAccount, value: 10n ** 20n });
    const payload = createArcPrivacyPayload();
    const [approval] = buildArcPoolDepositCalls(amount, payload);

    const result = await executeBatch(ARC_PRIVACY_HUB_CHAIN_ID, routeId, [approval]);
    assert.ok(result.txHash);
    assert.notEqual(await testClient.getCode({ address: hubAccount }), undefined);
    assert.equal(
      await testClient.readContract({
        address: ARC_PRIVACY_USDC,
        abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
        functionName: 'allowance',
        args: [hubAccount, ARC_PRIVACY_ENTRYPOINT],
      }),
      amount
    );
  }
);

// Arc USDC is backed by a chain-specific native-token precompile. Anvil can fork
// the contracts but currently faults with StackUnderflow when USDC transferFrom
// reaches that precompile. Run this only with a fork engine that implements the
// Arc native-USDC precompile; it performs no live-chain writes.
void test(
  'deposits from a route Nexus account into the real Arc privacy pool on a compatible fork',
  { skip: !forkRpc || process.env.ARC_PRIVACY_FORK_NATIVE_USDC !== 'true' },
  async () => {
    process.env.PRIVATE_KEY = ANVIL_PRIVATE_KEY;
    process.env.ROUTE_ENCRYPTION_KEY = 'fork-integration-test-key';
    await chainManager.initialize();
    const chain = chainManager.getChain(ARC_PRIVACY_HUB_CHAIN_ID);
    if (!chain || !forkRpc) throw new Error('Arc fork is not configured');
    const viemChain = chain.getViemChain();
    const testClient = createTestClient({ chain: viemChain, mode: 'anvil', transport: http(forkRpc) })
      .extend(publicActions);
    const owner = privateKeyToAccount(ANVIL_PRIVATE_KEY);
    await testClient.setBalance({ address: owner.address, value: 10n ** 30n });

    const routeId = `route_fork_pool_${Date.now()}`;
    const hubAccount = await deriveHubAddress(ARC_PRIVACY_HUB_CHAIN_ID, routeId);
    const amount = 5_000_000n;
    // Arc maps 6-decimal ERC-20 USDC onto its 18-decimal native balance.
    await testClient.setBalance({
      address: hubAccount,
      value: amount * 10n ** 12n,
    });

    const beforeSize = await testClient.readContract({
      address: ARC_PRIVACY_POOL,
      abi: parseAbi(['function currentTreeSize() view returns (uint256)']),
      functionName: 'currentTreeSize',
    });
    const route = {
      id: routeId,
      hubAccount,
      hubChainId: ARC_PRIVACY_HUB_CHAIN_ID,
      tokenAddress: ARC_PRIVACY_USDC,
    } as PrivateRoute;
    const deposited = await depositIntoArcPrivacyPool(route, createArcPrivacyPayload(), amount);
    assert.ok(deposited.deposit?.transactionHash);
    assert.equal(deposited.deposit?.value, '4950000');
    assert.equal(
      await testClient.readContract({
        address: ARC_PRIVACY_ENTRYPOINT,
        abi: parseAbi(['function usedPrecommitments(uint256) view returns (bool)']),
        functionName: 'usedPrecommitments',
        args: [BigInt(deposited.precommitment)],
      }),
      true
    );
    assert.equal(
      await testClient.readContract({
        address: ARC_PRIVACY_POOL,
        abi: parseAbi(['function currentTreeSize() view returns (uint256)']),
        functionName: 'currentTreeSize',
      }),
      beforeSize + 1n
    );
  }
);
