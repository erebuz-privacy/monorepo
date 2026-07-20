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
  unshieldERC20,
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

// process.exit() truncates piped stdout mid-flush; drain first so no logs are lost.
async function flushExit(code: number): Promise<never> {
  await new Promise<void>((res) => process.stdout.write('', () => res()));
  process.exit(code);
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  void flushExit(1);
  throw new Error(msg);
}

let poiCauseLogged = false;
process.on('unhandledRejection', (reason) => {
  const err = reason as { message?: string; cause?: unknown; stack?: string };
  const msg = String(err?.message || reason);
  if (/POI|refresh POIs|generate POIs/i.test(msg)) {
    if (process.env.POI_DEBUG && !poiCauseLogged) {
      poiCauseLogged = true;
      console.error('  [poi-refresh-cause]', err?.cause ?? err?.stack ?? msg);
    }
    return;
  }
  console.error('\n❌ unhandledRejection:', reason);
  void flushExit(1);
});
process.on('exit', (code) => console.error(`[exit] code=${code}`));

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
  console.log(`  engine init returned. ready=${isRailgunReady()}`);
  if (!isRailgunReady()) {
    fail(
      'Railgun engine not ready. Check the POI node is running and serves Sepolia ' +
        '(curl $RAILGUN_POI_NODE_URL/node-status-v2 should list "Ethereum_Sepolia"), ' +
        'and that RAILGUN_POI_NODE_URL is reachable.'
    );
  }
  console.log(`  Railgun 0zk address: ${getRailgunAddress()}\n`);

  const skipShield = process.argv.includes('--skip-shield');
  if (skipShield) {
    console.log('→ [1/3] Skipping shield (--skip-shield); using existing shielded balance.\n');
  } else {
    console.log(`→ [1/3] Shielding ${amountEth} ETH from ${eoa}...`);
    const shield = await shieldBaseToken({ chainId: SEPOLIA, amount, signerPrivateKey: pk });
    console.log(`  shield tx: https://sepolia.etherscan.io/tx/${shield.txHash}\n`);
  }

  console.log('→ [2/3] Waiting for scan + POI (shield must be listed by the POI node)...');
  const bal = await waitForShieldedBalance({
    chainId: SEPOLIA,
    tokenAddress: WETH_SEPOLIA,
    minAmount: amount,
    timeoutMs: 900_000,
    onPoll: ({ total, spendable }) =>
      console.log(`  balance total=${ethers.formatEther(total)} spendable=${ethers.formatEther(spendable)} ETH`),
  });
  if (bal.spendable < amount) {
    fail(
      `Spendable balance ${ethers.formatEther(bal.spendable)} ETH (total ${ethers.formatEther(bal.total)}) ` +
        `did not reach ${amountEth} ETH before timeout. If total>0 but spendable=0, the POI node is still ` +
        'listing the shield backlog — wait for its shieldQueue addedPOI to catch up, then rerun.'
    );
  }
  console.log(`  spendable: ${ethers.formatEther(bal.spendable)} ETH\n`);

  // Unshield slightly less than shielded to leave room for the pool's tiny fee.
  // Unshield the wrapped token (WETH) via the ERC-20 path — this is the same path
  // production uses for the USDC hub, and it avoids a base-token-unshield bug in
  // wallet 10.4.0. The recipient receives WETH (unwrappable to ETH).
  const unshieldAmount = (amount * 995n) / 1000n;
  console.log(`→ [3/3] Unshielding ${ethers.formatEther(unshieldAmount)} WETH back to ${eoa} (generating proof)...`);
  const unshield = await unshieldERC20({
    chainId: SEPOLIA,
    tokenAddress: WETH_SEPOLIA,
    amount: unshieldAmount,
    toAddress: eoa,
    gasPrivateKey: pk,
  });
  console.log(`  unshield tx: https://sepolia.etherscan.io/tx/${unshield.txHash}\n`);

  console.log('✅ Sepolia round trip complete: shielded and unshielded via the Railgun pool + your POI node.');
  await flushExit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Sepolia test failed:', err?.stack || err?.message || err);
  await flushExit(1);
});
