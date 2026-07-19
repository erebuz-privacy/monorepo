#!/usr/bin/env tsx

/**
 * Ethereum Sepolia privacy-leg test: shield ETH -> unshield ETH.
 *
 * Proves the one code path that never runs on mainnet without real money — the
 * Railgun shield -> unshield round trip — against a live testnet and your own
 * POI node, using faucet ETH. This is the testnet "does it actually work?" check.
 *
 * What it does (real, on Sepolia):
 *   1. Init the Railgun engine on Sepolia (chain 11155111) via the POI node.
 *   2. Shield a small amount of native ETH from your funded EOA.
 *   3. Wait for the shield to be scanned into the merkletree (spendable balance).
 *   4. Unshield it back to the same EOA (generates a proof against the POI node).
 *
 * Prerequisites:
 *   - A POI node serving Sepolia (infra/poi-node or infra/stack — /node-status-v2
 *     lists "Ethereum_Sepolia"), reachable at RAILGUN_POI_NODE_URL.
 *   - RAILGUN_MNEMONIC + RAILGUN_ENCRYPTION_KEY (from gen:railgun-keys; the test
 *     auto-loads .env.railgun.local / .env if present).
 *   - PRIVATE_KEY = a Sepolia EOA funded with a little ETH (faucet:
 *     https://sepoliafaucet.com or https://www.alchemy.com/faucets/ethereum-sepolia).
 *   - A Sepolia RPC — set RAILGUN_RPC_11155111 (Alchemy/Infura recommended; the
 *     built-in public RPC rate-limits the initial scan).
 *
 * Usage:
 *   RAILGUN_RPC_11155111=<url> PRIVATE_KEY=<funded-sepolia-key> \
 *     pnpm --filter @erebuz/tee test:sepolia -- --amount=0.001
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ethers } from 'ethers';
import {
  initRailgunEngine,
  isRailgunReady,
  isRailgunConfigured,
  getRailgunAddress,
  shieldBaseToken,
  unshieldBaseToken,
  waitForShieldedBalance,
} from '../services/railgun';

const SEPOLIA = 11155111;
const WETH_SEPOLIA = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

// Lightweight .env loader (the project has no dotenv). Fills in any vars that are
// not already set in the shell, from local secret files, without overriding them.
function loadEnvFiles(): void {
  for (const file of ['.env.railgun.local', '.env']) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

function arg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(`--${name}=`.length) : fallback;
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnvFiles();

  const amountEth = arg('amount', '0.001');
  const amount = ethers.parseEther(amountEth);
  const pk = process.env.PRIVATE_KEY;
  if (!pk) fail('PRIVATE_KEY is required (a Sepolia EOA funded with a little ETH).');
  if (!process.env.RAILGUN_RPC_11155111) {
    console.warn('⚠ RAILGUN_RPC_11155111 not set — falling back to the public Sepolia RPC (may rate-limit the scan).');
  }

  const signer = new ethers.Wallet(pk);
  const eoa = signer.address;
  console.log(`\n=== Sepolia privacy-leg test ===`);
  console.log(`EOA:    ${eoa}`);
  console.log(`Amount: ${amountEth} ETH\n`);

  if (!isRailgunConfigured()) {
    fail('Railgun not configured — need RAILGUN_POI_NODE_URL + RAILGUN_MNEMONIC + RAILGUN_ENCRYPTION_KEY.');
  }

  console.log('→ Initializing Railgun engine on Sepolia (via POI node)...');
  await initRailgunEngine(SEPOLIA);
  if (!isRailgunReady()) {
    fail(
      'Railgun engine not ready. Check the POI node is running and serves Sepolia ' +
        '(curl $RAILGUN_POI_NODE_URL/node-status-v2 should list "Ethereum_Sepolia"), ' +
        'and that RAILGUN_POI_NODE_URL is reachable.'
    );
  }
  console.log(`  Railgun 0zk address: ${getRailgunAddress()}\n`);

  console.log(`→ [1/3] Shielding ${amountEth} ETH from ${eoa}...`);
  const shield = await shieldBaseToken({ chainId: SEPOLIA, amount, signerPrivateKey: pk });
  console.log(`  shield tx: https://sepolia.etherscan.io/tx/${shield.txHash}\n`);

  console.log('→ [2/3] Waiting for the shield to be scanned into the merkletree...');
  const bal = await waitForShieldedBalance({
    chainId: SEPOLIA,
    tokenAddress: WETH_SEPOLIA,
    minAmount: amount,
    timeoutMs: 300_000,
    onPoll: (b) => console.log(`  shielded balance: ${ethers.formatEther(b)} ETH`),
  });
  if (bal < amount) {
    fail(`Shielded balance ${ethers.formatEther(bal)} ETH did not reach ${amountEth} ETH before timeout. ` +
      'The scan can be slow on public RPC — set RAILGUN_RPC_11155111 and retry.');
  }
  console.log(`  scanned. spendable: ${ethers.formatEther(bal)} ETH\n`);

  // Unshield slightly less than shielded to leave room for the pool's tiny fee.
  const unshieldAmount = (amount * 995n) / 1000n;
  console.log(`→ [3/3] Unshielding ${ethers.formatEther(unshieldAmount)} ETH back to ${eoa} (generating proof)...`);
  const unshield = await unshieldBaseToken({
    chainId: SEPOLIA,
    amount: unshieldAmount,
    toAddress: eoa,
    gasPrivateKey: pk,
  });
  console.log(`  unshield tx: https://sepolia.etherscan.io/tx/${unshield.txHash}\n`);

  console.log('✅ Sepolia round trip complete: ETH shielded and unshielded via the Railgun pool + your POI node.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Sepolia test failed:', err?.message || err);
  process.exit(1);
});
