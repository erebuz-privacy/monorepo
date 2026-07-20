#!/usr/bin/env tsx
/**
 * Nexus AA execution self-test (Base Sepolia).
 *
 * Proves the one path that never runs without a live testnet + funded key: a
 * self-bundled UserOperation from a TEE-owned Nexus (ERC-7579) smart account —
 *   gas top-up -> deploy-on-first-use (factory init) -> DEFAULT-validator nonce
 *   -> owner signature -> ERC-7579 batch execute.
 *
 * It uses a FRESH per-run routeId (its own empty counterfactual account) and a
 * zero-value action (USDC.approve(owner, 1)), so NO USDC moves — only a few cents
 * of testnet gas (auto-funded to the account by executeBatch). Verifies the
 * account deployed and the on-chain allowance was set.
 *
 * Usage:
 *   pnpm --filter @erebuz/tee test:aa [-- --chain=84532 --route=aa-selftest]
 */
import '../config/load-env'; // loads .env / .env.railgun.local (+ maps TEST_PRIVATE_KEY) as a side effect
import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import { chainManager } from '../managers/chain';
import { deriveHubAddress, executeBatch, isAaReady } from '../services/aa';
import { cctpUsdc } from '../services/cctp';

function arg(name: string, fallback: string): string {
  const f = process.argv.find((a) => a.startsWith(`--${name}=`));
  return f ? f.slice(`--${name}=`.length) : fallback;
}

const ERC20_ALLOWANCE_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY / TEST_PRIVATE_KEY required');
  await chainManager.initialize();

  const chainId = Number(arg('chain', '84532'));
  // fresh routeId each run => fresh empty account (exercises deploy-on-first-use)
  const routeId = `${arg('route', 'aa-selftest')}-${process.pid}`;

  console.log(`\n=== Nexus AA self-test on chain ${chainId} (route ${routeId}) ===`);
  if (!isAaReady(chainId)) throw new Error(`AA not ready on ${chainId} (need PRIVATE_KEY + Nexus factory/bootstrap)`);

  const owner = getAddress((await import('viem/accounts')).privateKeyToAccount(process.env.PRIVATE_KEY as Hex).address);
  const sender = await deriveHubAddress(chainId, routeId);
  console.log(`owner (TEE EOA): ${owner}`);
  console.log(`smart account : ${sender}`);

  const chain = chainManager.getChain(chainId)!;
  const publicClient = chain.getPublicClient();
  const usdc = getAddress(cctpUsdc(chainId)) as Address;

  const codeBefore = await publicClient.getCode({ address: sender });
  const allowanceBefore = (await publicClient.readContract({
    address: usdc, abi: ERC20_ALLOWANCE_ABI, functionName: 'allowance', args: [sender, owner],
  })) as bigint;
  console.log(`\nbefore: deployed=${codeBefore && codeBefore !== '0x'} allowance(SA->owner)=${allowanceBefore}`);

  // Zero-value action: approve 1 unit of USDC to the owner. No USDC needed.
  const approveData = encodeFunctionData({ abi: ERC20_ALLOWANCE_ABI, functionName: 'approve', args: [owner, 1n] }) as Hex;

  console.log(`\n→ executing self-bundled UserOp (deploy + approve) ...`);
  const { txHash } = await executeBatch(chainId, routeId, [{ to: usdc, data: approveData }]);
  console.log(`  handleOps tx: ${txHash}`);

  const codeAfter = await publicClient.getCode({ address: sender });
  const allowanceAfter = (await publicClient.readContract({
    address: usdc, abi: ERC20_ALLOWANCE_ABI, functionName: 'allowance', args: [sender, owner],
  })) as bigint;
  console.log(`\nafter : deployed=${codeAfter && codeAfter !== '0x'} allowance(SA->owner)=${allowanceAfter}`);

  const deployed = Boolean(codeAfter && codeAfter !== '0x');
  const executed = allowanceAfter === 1n;
  if (!deployed) throw new Error('account was NOT deployed');
  if (!executed) throw new Error(`batch did NOT execute (allowance=${allowanceAfter}, expected 1)`);

  console.log('\n✅ Nexus AA path works: account deployed + default-validator UserOp validated + batch executed.');
  await new Promise<void>((res) => process.stdout.write('', () => res()));
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\n❌ AA self-test failed:', e?.shortMessage || e?.message || e);
  if (e?.cause) console.error('  cause:', e.cause?.shortMessage || e.cause?.message || e.cause);
  await new Promise<void>((res) => process.stdout.write('', () => res()));
  process.exit(1);
});
