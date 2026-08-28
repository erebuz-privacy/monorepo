#!/usr/bin/env tsx
/**
 * Create + deploy the Starknet Sepolia account the CCTP Starknet harness signs with.
 *
 * Starknet accounts are contracts, so this is a two-step dance: derive a
 * counterfactual address from (class hash, salt, public key), fund THAT address
 * with STRK, then let the account pay for its own DEPLOY_ACCOUNT transaction.
 * Starknet 0.14 dropped v1/v2 transactions, so gas is STRK only — ETH will not do.
 *
 * Uses the OpenZeppelin account preset (constructor is a single `public_key`),
 * which is the right shape for a backend-controlled signer: no guardian, no
 * multisig, no recovery flow.
 *
 * Usage:
 *   pnpm --filter @erebuz/tee starknet:account            # derive + save + show funding steps
 *   pnpm --filter @erebuz/tee starknet:account -- --deploy # deploy once STRK has landed
 *
 * Writes STARKNET_ACCOUNT_ADDRESS / STARKNET_PRIVATE_KEY into packages/tee/.env
 * (gitignored). Re-running never regenerates an existing key.
 */
import '../config/load-env';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { Account, CallData, RpcProvider, ec, hash, stark } from 'starknet';

// OpenZeppelin account preset, verified declared on Starknet Sepolia.
const OZ_ACCOUNT_CLASS_HASH = '0x00e2eb8f5672af4e6a4e8a8f1b44989685e668489b0a25437733756c5a34a1d6';
const SN_STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const SN_USDC = '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343';
const RPCS = ['https://api.cartridge.gg/x/starknet/sepolia', 'https://starknet-sepolia.drpc.org'];

// Enough to cover a DEPLOY_ACCOUNT plus the receive_message / deposit_for_burn
// calls the harness makes. Faucets hand out far more than this.
const MIN_STRK_WEI = 2n * 10n ** 17n; // 0.2 STRK

const ENV_PATH = join(process.cwd(), '.env');
const has = (f: string) => process.argv.includes(`--${f}`);

function rpcUrls(): string[] {
  const override = process.env.STARKNET_RPC_URL?.trim();
  return override ? [override, ...RPCS.filter((u) => u !== override)] : RPCS;
}

function provider(): RpcProvider {
  return new RpcProvider({ nodeUrl: rpcUrls()[0] });
}

/** Read across endpoints — public Starknet RPCs answer -32601 intermittently. */
async function read(contractAddress: string, entrypoint: string, calldata: string[] = []): Promise<string[]> {
  let lastErr: unknown;
  for (const url of rpcUrls()) {
    try {
      return await new RpcProvider({ nodeUrl: url }).callContract({ contractAddress, entrypoint, calldata });
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`${entrypoint} failed: ${String((lastErr as Error)?.message ?? lastErr).slice(0, 120)}`);
}

async function isDeployed(address: string): Promise<boolean> {
  for (const url of rpcUrls()) {
    try {
      const h = await new RpcProvider({ nodeUrl: url }).getClassHashAt(address);
      return Boolean(h && BigInt(h) !== 0n);
    } catch (err) {
      const blob = String((err as Error)?.message ?? err).toLowerCase();
      if (blob.includes('contract not found') || blob.includes('20:')) return false;
    }
  }
  return false;
}

function u256(result: string[]): bigint {
  return (BigInt(result[1]) << 128n) | BigInt(result[0]);
}

const fmt = (wei: bigint, dp: number) => {
  const s = wei.toString().padStart(dp + 1, '0');
  return `${s.slice(0, -dp)}.${s.slice(-dp).replace(/0+$/, '') || '0'}`;
};

/** Upsert keys into packages/tee/.env without disturbing existing lines. */
function saveEnv(values: Record<string, string>): void {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  if (text && !text.endsWith('\n')) text += '\n';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text}${line}\n`;
  }
  writeFileSync(ENV_PATH, text, { mode: 0o600 });
  chmodSync(ENV_PATH, 0o600);
}

function deriveAccount(privateKey: string): { publicKey: string; address: string; constructorCalldata: string[] } {
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  const constructorCalldata = CallData.compile({ public_key: publicKey });
  // salt = public key is the OZ convention, and makes the address a pure
  // function of the key: the same key always recovers the same account.
  const address = hash.calculateContractAddressFromHash(
    publicKey,
    OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    0
  );
  return { publicKey, address, constructorCalldata };
}

async function main(): Promise<void> {
  let privateKey = process.env.STARKNET_PRIVATE_KEY?.trim();
  let generated = false;
  if (!privateKey) {
    privateKey = stark.randomAddress(); // stark-curve-valid scalar
    generated = true;
  }

  const { publicKey, address, constructorCalldata } = deriveAccount(privateKey);
  const stored = process.env.STARKNET_ACCOUNT_ADDRESS?.trim();
  if (stored && BigInt(stored) !== BigInt(address)) {
    throw new Error(
      `STARKNET_ACCOUNT_ADDRESS in .env (${stored}) does not match the address derived from ` +
        `STARKNET_PRIVATE_KEY (${address}). Fix or clear both before continuing.`
    );
  }

  saveEnv({ STARKNET_ACCOUNT_ADDRESS: address, STARKNET_PRIVATE_KEY: privateKey });

  console.log('\n═══ Starknet Sepolia account ═══\n');
  if (generated) console.log('  generated a new keypair and saved it to packages/tee/.env');
  else console.log('  reusing the keypair already in packages/tee/.env');
  console.log(`  address:    ${address}`);
  console.log(`  public key: ${publicKey}`);
  console.log(`  class:      OpenZeppelin preset ${OZ_ACCOUNT_CLASS_HASH}`);
  console.log('  private key: written to packages/tee/.env (not printed)\n');

  const deployed = await isDeployed(address);
  const [strk, usdc] = await Promise.all([
    read(SN_STRK, 'balance_of', [address]).then(u256).catch(() => 0n),
    read(SN_USDC, 'balance_of', [address]).then(u256).catch(() => 0n),
  ]);

  console.log(`  deployed:   ${deployed ? 'yes' : 'NO (counterfactual so far)'}`);
  console.log(`  STRK (gas): ${fmt(strk, 18)}`);
  console.log(`  USDC:       ${fmt(usdc, 6)}\n`);

  if (deployed) {
    console.log('✅ Account is live. Next:\n');
    console.log('   pnpm --filter @erebuz/tee test:cctp:starknet -- --preflight');
    console.log('   pnpm --filter @erebuz/tee test:cctp:starknet -- --direction=roundtrip --amount=0.5\n');
    return;
  }

  if (strk < MIN_STRK_WEI) {
    console.log(`⚠  Needs at least ${fmt(MIN_STRK_WEI, 18)} STRK before it can deploy itself.\n`);
    console.log('   Paste this address into either faucet:\n');
    console.log(`     ${address}\n`);
    console.log('     https://faucet.starknet.io/          (Starknet Foundation, STRK)');
    console.log('     https://starknet-faucet.vercel.app/  (community mirror)');
    console.log('     https://blastapi.io/faucets/starknet-sepolia-strk\n');
    console.log('   Funding an undeployed address is normal on Starknet — the balance');
    console.log('   is just storage in the STRK contract, and the account deploys itself after.\n');
    console.log('   Then run:  pnpm --filter @erebuz/tee starknet:account -- --deploy\n');
    return;
  }

  if (!has('deploy')) {
    console.log('✅ Funded and ready to deploy. Run:\n');
    console.log('   pnpm --filter @erebuz/tee starknet:account -- --deploy\n');
    return;
  }

  console.log('→ deploying the account (it pays its own DEPLOY_ACCOUNT fee in STRK)');
  const p = provider();
  const account = new Account({ provider: p, address, signer: privateKey, cairoVersion: '1' });
  const { transaction_hash, contract_address } = await account.deployAccount({
    classHash: OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    addressSalt: publicKey,
    contractAddress: address,
  });
  console.log(`   tx: https://sepolia.starkscan.co/tx/${transaction_hash}`);
  await p.waitForTransaction(transaction_hash);
  console.log(`   deployed at ${contract_address}\n`);

  const after = await read(SN_STRK, 'balance_of', [address]).then(u256);
  console.log(`   STRK left: ${fmt(after, 18)}\n`);
  console.log('✅ Account deployed. Next:\n');
  console.log('   pnpm --filter @erebuz/tee test:cctp:starknet -- --direction=roundtrip --amount=0.5\n');
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error)?.message || e}\n`);
  process.exit(1);
});
