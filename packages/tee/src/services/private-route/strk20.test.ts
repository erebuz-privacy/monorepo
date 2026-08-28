import assert from 'node:assert/strict';
import test from 'node:test';
import { computeStrk20RouteFees } from './fee';
import { quotePrivateRoute } from './quote';
import {
  cctpCanBeSource,
  cctpIsStarknet,
  addressToBytes32,
  assertMintRecipientShape,
} from '../cctp';
import { STRK20_PRIVACY_HUB_CHAIN_ID } from '../../config/global-config';
import {
  feltToBytes32,
  starknetHubAccount,
  hexToCairoByteArray,
  isStarknetAddress,
  normalizeStarknetAddress,
} from '../cctp/starknet';

const BASE_SEPOLIA = 84532;
const ARB_SEPOLIA = 421614;

void test('prices the STRK20 route against the real 14 bps Starknet outbound leg', () => {
  const amount = 10_000_000n; // 10 USDC
  const fees = computeStrk20RouteFees(amount, 10, 14n);
  assert.equal(fees.serviceFee, 1_000_000n); // 10% floor at the $1 default
  assert.equal(fees.withdrawalAmount, 9_000_000n);
  assert.equal(fees.bridgeFee, 12_600n); // 14 bps of 9 USDC
  assert.equal(fees.quotedOutput, 8_987_400n);

  // A 3 bps assumption would over-promise by ~11 bps of the withdrawal, breaking
  // `delivered >= quoted` — the invariant the whole fee model exists to hold.
  const understated = computeStrk20RouteFees(amount, 10, 3n);
  assert.ok(understated.quotedOutput > fees.quotedOutput);
});

void test('quotes Base Sepolia -> Arbitrum Sepolia through the Starknet hub', async () => {
  const quote = await quotePrivateRoute({
    sourceChainId: BASE_SEPOLIA,
    destChainId: ARB_SEPOLIA,
    amount: '10',
    privacyProvider: 'strk20',
  });
  assert.equal(quote.privacyProvider, 'strk20');
  assert.equal(quote.hubChainId, STRK20_PRIVACY_HUB_CHAIN_ID);
  assert.deepEqual(quote.route, [
    'Base Sepolia',
    'Circle CCTP',
    'STRK20 pool (Starknet)',
    'Circle CCTP',
    'Arbitrum Sepolia',
  ]);
  // Delivered must be strictly less than the input minus the service fee, because
  // the destination-facing burn originates on Starknet and costs real bps.
  assert.ok(BigInt(quote.bridgeFeeAmount) > 0n);
  assert.ok(BigInt(quote.quotedOutputAmount) < BigInt(quote.amount) - BigInt(quote.feeAmount));
});

void test('refuses Starknet as a route source', async () => {
  assert.equal(cctpIsStarknet(STRK20_PRIVACY_HUB_CHAIN_ID), true);
  assert.equal(cctpCanBeSource(STRK20_PRIVACY_HUB_CHAIN_ID), false);
  assert.equal(cctpCanBeSource(BASE_SEPOLIA), true);
  // Source deposits need a per-route Nexus smart account, which does not exist on
  // Starknet — so it can be a hub or a destination, never a source.
  await assert.rejects(
    quotePrivateRoute({
      sourceChainId: STRK20_PRIVACY_HUB_CHAIN_ID,
      destChainId: ARB_SEPOLIA,
      amount: '10',
      privacyProvider: 'strk20',
    }),
    /cannot be a route source/
  );
});

void test('pads a Starknet felt across all 32 bytes, unlike an EVM address', () => {
  // The old fixed 12-zero-bytes + 20-byte pad would have truncated a felt and
  // burned funds to an address nobody controls.
  const felt = '0x50bdf4d0ba9bac654b3f0225f480c912f2d9acd17da7974f61b2b08393e2d62';
  const padded = feltToBytes32(felt);
  assert.equal(padded.length, 66);
  assert.equal(BigInt(padded), BigInt(felt));
  // addressToBytes32 is now generic, so it agrees with feltToBytes32.
  assert.equal(addressToBytes32(felt), padded);
  // and still round-trips a 20-byte EVM address
  const evm = '0xc6377415ee98a7b71161ee963603ee52ff7750fc';
  assert.equal(addressToBytes32(evm), `0x000000000000000000000000${evm.slice(2)}`);
});

void test('validates and normalizes Starknet addresses', () => {
  const felt = '0x50bdf4d0ba9bac654b3f0225f480c912f2d9acd17da7974f61b2b08393e2d62';
  assert.equal(isStarknetAddress(felt), true);
  assert.equal(normalizeStarknetAddress(felt).length, 66);
  assert.equal(BigInt(normalizeStarknetAddress(felt)), BigInt(felt));
  assert.equal(isStarknetAddress('0x0'), false); // zero
  assert.equal(isStarknetAddress('not-hex'), false);
  // above the STARK field modulus
  assert.equal(isStarknetAddress(`0x${'f'.repeat(64)}`), false);
});

void test('encodes a Cairo ByteArray at the 31-byte word boundary', () => {
  // 31 bytes exactly -> one full word, empty pending word.
  const w = hexToCairoByteArray(`0x${'ab'.repeat(31)}`);
  assert.equal(w.data.length, 1);
  assert.equal(w.pending_word_len, 0);
  // 32 bytes -> one full word plus a 1-byte tail.
  const w1 = hexToCairoByteArray(`0x${'ab'.repeat(32)}`);
  assert.equal(w1.data.length, 1);
  assert.equal(w1.pending_word_len, 1);
  // Raw non-UTF8 bytes must survive; a text encoder would mangle these.
  const raw = hexToCairoByteArray('0x00ff8001fe');
  assert.equal(raw.pending_word_len, 5);
  assert.equal(BigInt(raw.pending_word), BigInt('0x00ff8001fe'));
  assert.throws(() => hexToCairoByteArray('0xabc'), /odd number of nibbles/);
});

void test('refuses to burn to Starknet with an EVM-shaped recipient', () => {
  const evmEoa = '0xc6377415Ee98A7b71161Ee963603eE52fF7750FC';
  const felt = '0x50bdf4d0ba9bac654b3f0225f480c912f2d9acd17da7974f61b2b08393e2d62';

  // Regression: deriveHubAddress falls back to the TEE's EVM EOA for chains with
  // no Nexus stack. For a Starknet hub that produced a 20-byte address used as a
  // felt, and the CCTP mint went somewhere nobody can sign for — funds gone.
  assert.throws(
    () => assertMintRecipientShape(STRK20_PRIVACY_HUB_CHAIN_ID, evmEoa),
    /20-byte EVM address/
  );
  assert.throws(() => assertMintRecipientShape(STRK20_PRIVACY_HUB_CHAIN_ID, '0x0'), /not a valid felt/);
  // A real felt passes, and EVM destinations are unaffected.
  assert.doesNotThrow(() => assertMintRecipientShape(STRK20_PRIVACY_HUB_CHAIN_ID, felt));
  assert.doesNotThrow(() => assertMintRecipientShape(BASE_SEPOLIA, evmEoa));
});

void test('starknetHubAccount rejects a missing or EVM-shaped hub address', () => {
  const prev = process.env.STARKNET_ACCOUNT_ADDRESS;
  try {
    delete process.env.STARKNET_ACCOUNT_ADDRESS;
    assert.throws(() => starknetHubAccount(), /required/);

    process.env.STARKNET_ACCOUNT_ADDRESS = '0xc6377415Ee98A7b71161Ee963603eE52fF7750FC';
    assert.throws(() => starknetHubAccount(), /looks like a 20-byte EVM address/);

    process.env.STARKNET_ACCOUNT_ADDRESS =
      '0x50bdf4d0ba9bac654b3f0225f480c912f2d9acd17da7974f61b2b08393e2d62';
    assert.equal(starknetHubAccount().length, 66);
  } finally {
    if (prev === undefined) delete process.env.STARKNET_ACCOUNT_ADDRESS;
    else process.env.STARKNET_ACCOUNT_ADDRESS = prev;
  }
});
