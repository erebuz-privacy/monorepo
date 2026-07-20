#!/usr/bin/env tsx
/**
 * CCTP testnet round-trip check: burn USDC on Base Sepolia -> attest -> mint on
 * Ethereum Sepolia. Proves the CCTP bridge works before wiring it into the flow.
 *
 * Usage:
 *   RPC_84532=<base-sepolia-rpc> RAILGUN_RPC_11155111=<sepolia-rpc> \
 *   PRIVATE_KEY=<funded base sepolia usdc key> \
 *     pnpm --filter @erebuz/tee test:cctp -- --amount=1
 */
import '../config/load-env'; // loads .env / .env.railgun.local (+ maps TEST_PRIVATE_KEY) as a side effect
import { ethers } from 'ethers';
import { cctpBurn, cctpFetchAttestation, cctpMint } from '../services/cctp';

const BASE_SEPOLIA = 84532;
const ETH_SEPOLIA = 11155111;
const USDC_BASE = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_SEP = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

function arg(name: string, fallback: string): string {
  const f = process.argv.find((a) => a.startsWith(`--${name}=`));
  return f ? f.slice(`--${name}=`.length) : fallback;
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY required (funded with Base Sepolia USDC)');
  process.env.RPC_84532 = process.env.RPC_84532 || 'https://sepolia.base.org';
  process.env.RAILGUN_RPC_11155111 =
    process.env.RAILGUN_RPC_11155111 || 'https://ethereum-sepolia-rpc.publicnode.com';

  const amount = ethers.parseUnits(arg('amount', '1'), 6);
  const wallet = new ethers.Wallet(pk);
  const recipient = wallet.address; // mint back to ourselves on Sepolia
  const sepProvider = new ethers.JsonRpcProvider(process.env.RAILGUN_RPC_11155111);
  const usdcSep = new ethers.Contract(USDC_SEP, ['function balanceOf(address) view returns (uint256)'], sepProvider);

  const before: bigint = await usdcSep.balanceOf(recipient);
  console.log(`\n=== CCTP test: ${arg('amount', '1')} USDC Base Sepolia -> Sepolia ===`);
  console.log(`recipient (Sepolia): ${recipient} | before: ${ethers.formatUnits(before, 6)} USDC\n`);

  console.log('→ [1/3] Burning on Base Sepolia...');
  const burn = await cctpBurn({
    sourceChainId: BASE_SEPOLIA,
    destChainId: ETH_SEPOLIA,
    usdc: USDC_BASE,
    amount,
    mintRecipient: recipient,
    signerPrivateKey: pk,
  });
  console.log(`  burn tx: https://sepolia.basescan.org/tx/${burn.txHash}\n`);

  console.log('→ [2/3] Waiting for Circle attestation...');
  const att = await cctpFetchAttestation({
    sourceChainId: BASE_SEPOLIA,
    burnTxHash: burn.txHash,
    onPoll: (s) => console.log(`  attestation status: ${s}`),
  });
  if (!att) throw new Error('attestation timed out');
  console.log('  attestation ready\n');

  console.log('→ [3/3] Minting on Sepolia...');
  const mint = await cctpMint({
    destChainId: ETH_SEPOLIA,
    message: att.message,
    attestation: att.attestation,
    signerPrivateKey: pk,
  });
  console.log(`  mint tx: https://sepolia.etherscan.io/tx/${mint.txHash}\n`);

  const after: bigint = await usdcSep.balanceOf(recipient);
  const delta = after - before;
  console.log(`recipient after: ${ethers.formatUnits(after, 6)} USDC (received ${ethers.formatUnits(delta, 6)})`);
  if (delta <= 0n) throw new Error('recipient did not receive USDC');
  console.log('\n✅ CCTP round trip complete: USDC burned on Base Sepolia, minted on Sepolia.');
  await new Promise<void>((res) => process.stdout.write('', () => res()));
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\n❌ CCTP test failed:', e?.message || e);
  await new Promise<void>((res) => process.stdout.write('', () => res()));
  process.exit(1);
});
