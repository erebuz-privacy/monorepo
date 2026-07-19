#!/usr/bin/env tsx

/**
 * Generate a fresh Railgun wallet mnemonic + encryption key, LOCALLY.
 *
 *   pnpm --filter @erebuz/tee gen:railgun-keys
 *
 * SECURITY: the output controls the TEE's shielded funds. It is a private key.
 *   - Run this on your own trusted machine only.
 *   - Store it in a secret manager (e.g. Doppler), never in git or chat.
 *   - If the values ever appear in a shared log/terminal, treat them as burned
 *     and generate new ones.
 */

import { Wallet } from 'ethers';
import { randomBytes } from 'node:crypto';

const wallet = Wallet.createRandom();
const mnemonic = wallet.mnemonic?.phrase;
if (!mnemonic) {
  console.error('Failed to generate a mnemonic.');
  process.exit(1);
}
const encryptionKey = randomBytes(32).toString('hex'); // 32-byte hex

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

console.log(red('╔══════════════════════════════════════════════════════════════╗'));
console.log(red('║  SECRET — controls shielded funds. Do NOT commit, paste, or   ║'));
console.log(red('║  screenshot. Store in a secret manager (Doppler), then clear   ║'));
console.log(red('║  your terminal.                                                ║'));
console.log(red('╚══════════════════════════════════════════════════════════════╝'));
console.log();
console.log(`RAILGUN_MNEMONIC="${mnemonic}"`);
console.log(`RAILGUN_ENCRYPTION_KEY=${encryptionKey}`);
console.log();
console.log(dim('Add both to packages/tee/.env (or Doppler). Losing the mnemonic'));
console.log(dim('loses access to the shielded balance; leaking it loses the funds.'));
