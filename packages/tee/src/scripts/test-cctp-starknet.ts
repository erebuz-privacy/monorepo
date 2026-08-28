#!/usr/bin/env tsx
/**
 * CCTP testnet check for the Starknet leg: Base Sepolia <-> Starknet Sepolia.
 *
 * Proves the transport half of a future STRK20 privacy provider WITHOUT needing
 * StarkWare's proving/indexer services — this only moves native USDC via Circle
 * CCTP v2, exactly as the Railgun/Arc routes do on their EVM legs.
 *
 * Starknet differs from every chain already in services/cctp in three ways, and
 * the helpers below are written to be lifted verbatim into a future
 * services/cctp/starknet.ts:
 *   1. TokenMessengerV2 + TokenMinterV2 are ONE contract (TokenMessengerMinterV2).
 *   2. `message` / `attestation` are Cairo `ByteArray`s, not EVM `bytes`.
 *   3. Addresses are felts (252-bit), so mintRecipient is a plain 32-byte pad —
 *      not the 12-zero-bytes + 20-byte-address pad that addressToBytes32 does.
 *
 * Usage:
 *   # read-only: verifies every address, contract and encoder. No keys, no funds.
 *   pnpm --filter @erebuz/tee test:cctp:starknet -- --preflight
 *
 *   # Base Sepolia -> Starknet Sepolia
 *   pnpm --filter @erebuz/tee test:cctp:starknet -- --direction=in --amount=0.5
 *
 *   # Starknet Sepolia -> Base Sepolia
 *   pnpm --filter @erebuz/tee test:cctp:starknet -- --direction=out --amount=0.5
 *
 *   # both, sequentially
 *   pnpm --filter @erebuz/tee test:cctp:starknet -- --direction=roundtrip --amount=0.5
 *
 * Env:
 *   PRIVATE_KEY               funded Base Sepolia EOA (USDC + ETH for gas)
 *   STARKNET_ACCOUNT_ADDRESS  DEPLOYED Starknet Sepolia account
 *   STARKNET_PRIVATE_KEY      its signing key
 *   STARKNET_RPC_URL          optional (default: a public Sepolia RPC)
 *   RPC_84532                 optional Base Sepolia RPC
 *   CCTP_IRIS_API             optional (default: Circle sandbox)
 */
import '../config/load-env';
import { ethers } from 'ethers';
import { Account, RpcProvider, constants } from 'starknet';
import { cctpMint } from '../services/cctp';

// ── Chains / domains ────────────────────────────────────────────────────────
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_DOMAIN = 6;
const STARKNET_DOMAIN = 25;

// EVM side (identical across every CCTP testnet chain — same as services/cctp).
const EVM_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Starknet Sepolia side (Circle: developers.circle.com/cctp/references/starknet-contracts).
const SN_TOKEN_MESSENGER_MINTER = '0x04bdde1e09a4b09a2f95d893d94a967b7717eb85a3f6deca8c080ee01fbc3370';
const SN_MESSAGE_TRANSMITTER = '0x04db7926c64f1f32a840f3fa95cb551f3801a3600bae87af87807a54dce12fe8';
const SN_USDC = '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343';
const SN_STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

// Public Starknet RPCs load-balance across nodes with uneven method support, so a
// single endpoint intermittently answers -32601 "starknet_call does not exist".
// Same class of problem as Arc's rate limiting (see managers/chain/chain.ts):
// retry across endpoints rather than trusting one.
const DEFAULT_SN_RPCS = ['https://api.cartridge.gg/x/starknet/sepolia', 'https://starknet-sepolia.drpc.org'];
const DEFAULT_BASE_RPC = 'https://sepolia.base.org';
const IRIS_API = process.env.CCTP_IRIS_API || 'https://iris-api-sandbox.circle.com';

// Fast Transfer. Starknet's min_fee for USDC is 0 on Sepolia, so any maxFee is
// accepted; keep the 1% cap services/cctp uses.
const FAST_FINALITY = 1000;
const MAX_FEE_BPS = 100n;

const TOKEN_MESSENGER_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)',
];
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

// ── Cairo ByteArray encoding ────────────────────────────────────────────────
// A Cairo ByteArray serializes as [data.len, ...data, pending_word,
// pending_word_len] where each `data` element is 31 raw bytes packed big-endian
// and the tail (< 31 bytes) goes in pending_word. CCTP messages are raw bytes,
// NOT text, so starknet.js's byteArrayFromString can't be used — it would
// re-encode the hex characters. `assertByteArrayEncoder` proves this
// implementation agrees with starknet.js on ASCII input.
const BYTES_PER_WORD = 31;

export interface CairoByteArray {
  data: string[];
  pending_word: string;
  pending_word_len: number;
}

export function hexToCairoByteArray(hex: string): CairoByteArray {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hex payload has an odd number of nibbles');
  if (clean.length > 0 && !/^[0-9a-fA-F]+$/.test(clean)) throw new Error('payload is not valid hex');
  const bytes = Buffer.from(clean, 'hex');

  const data: string[] = [];
  let offset = 0;
  while (bytes.length - offset >= BYTES_PER_WORD) {
    data.push(`0x${bytes.subarray(offset, offset + BYTES_PER_WORD).toString('hex')}`);
    offset += BYTES_PER_WORD;
  }
  const tail = bytes.subarray(offset);
  return {
    data,
    pending_word: tail.length ? `0x${tail.toString('hex')}` : '0x0',
    pending_word_len: tail.length,
  };
}

/** Flatten a ByteArray into raw felt calldata, in the order Cairo expects. */
export function byteArrayToCalldata(ba: CairoByteArray): string[] {
  return [`0x${ba.data.length.toString(16)}`, ...ba.data, ba.pending_word, `0x${ba.pending_word_len.toString(16)}`];
}

/** A felt (Starknet address) as an EVM bytes32 — plain left-pad, all 32 bytes usable. */
export function feltToBytes32(felt: string): string {
  const clean = felt.startsWith('0x') ? felt.slice(2) : felt;
  if (clean.length > 64) throw new Error(`felt ${felt} does not fit in 32 bytes`);
  return `0x${clean.padStart(64, '0')}`;
}

/** Split a u256 into the [low, high] felt pair Cairo calldata uses. */
export function u256ToCalldata(value: bigint): [string, string] {
  const mask = (1n << 128n) - 1n;
  return [`0x${(value & mask).toString(16)}`, `0x${(value >> 128n).toString(16)}`];
}

function u256FromResult(result: string[]): bigint {
  return (BigInt(result[1]) << 128n) | BigInt(result[0]);
}

// ── CCTP v2 message layout (see IMessageTransmitterV2 docs) ─────────────────
export interface DecodedCctpMessage {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: string;
  recipient: string;
  mintRecipient: string;
  amount: bigint;
}

export function decodeCctpMessage(message: string): DecodedCctpMessage {
  const b = Buffer.from(message.startsWith('0x') ? message.slice(2) : message, 'hex');
  if (b.length < 148) throw new Error(`CCTP message too short (${b.length} bytes)`);
  const body = b.subarray(148);
  return {
    version: b.readUInt32BE(0),
    sourceDomain: b.readUInt32BE(4),
    destinationDomain: b.readUInt32BE(8),
    nonce: `0x${b.subarray(12, 44).toString('hex')}`,
    recipient: `0x${b.subarray(76, 108).toString('hex')}`,
    // BurnMessageV2: version u32@0, burnToken@4, mintRecipient@36, amount u256@68
    mintRecipient: body.length >= 68 ? `0x${body.subarray(36, 68).toString('hex')}` : '0x',
    amount: body.length >= 100 ? BigInt(`0x${body.subarray(68, 100).toString('hex')}`) : 0n,
  };
}

// ── Iris attestation ───────────────────────────────────────────────────────
async function fetchAttestation(
  sourceDomain: number,
  burnTxHash: string,
  timeoutMs = 900_000
): Promise<{ message: string; attestation: string }> {
  const url = `${IRIS_API}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          messages?: Array<{ status?: string; message?: string; attestation?: string }>;
        };
        const m = data.messages?.[0];
        if (m?.status && m.status !== lastStatus) {
          lastStatus = m.status;
          console.log(`     attestation status: ${m.status}`);
        }
        if (m && m.status === 'complete' && m.message && m.attestation && m.attestation !== 'PENDING') {
          return { message: m.message, attestation: m.attestation };
        }
      }
    } catch {
      // transient; keep polling
    }
    await new Promise((r) => setTimeout(r, 6_000));
  }
  throw new Error(`attestation for ${burnTxHash} (domain ${sourceDomain}) timed out`);
}

// ── helpers ────────────────────────────────────────────────────────────────
function arg(name: string, fallback = ''): string {
  const f = process.argv.find((a) => a.startsWith(`--${name}=`));
  return f ? f.slice(`--${name}=`.length) : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);
const fmt = (v: bigint) => ethers.formatUnits(v, 6);
const ok = (b: boolean) => (b ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m');

function snRpcUrls(): string[] {
  const override = process.env.STARKNET_RPC_URL?.trim();
  return override ? [override, ...DEFAULT_SN_RPCS.filter((u) => u !== override)] : DEFAULT_SN_RPCS;
}

/** Writes need one stable provider; reads go through snRead's fallback pool. */
function snProvider(): RpcProvider {
  return new RpcProvider({ nodeUrl: snRpcUrls()[0] });
}

function baseProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(process.env.RPC_84532 || DEFAULT_BASE_RPC);
}

/** True for transient RPC faults worth retrying on another endpoint. */
function isTransientRpcError(err: unknown): boolean {
  const blob = String((err as Error)?.message ?? err).toLowerCase();
  return (
    blob.includes('-32601') ||
    blob.includes('does not exist/is not available') ||
    blob.includes('rate limit') ||
    blob.includes('too many requests') ||
    blob.includes('429') ||
    blob.includes('502') ||
    blob.includes('503') ||
    blob.includes('timeout') ||
    blob.includes('fetch failed') ||
    blob.includes('econnreset')
  );
}

/** A read that survives one endpoint answering nonsense: try each, then back off. */
async function snRead(contractAddress: string, entrypoint: string, calldata: string[] = []): Promise<string[]> {
  const urls = snRpcUrls();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of urls) {
      try {
        return await new RpcProvider({ nodeUrl: url }).callContract({ contractAddress, entrypoint, calldata });
      } catch (err) {
        lastErr = err;
        if (!isTransientRpcError(err)) throw err; // a real revert: surface it
      }
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error(`${entrypoint} on ${contractAddress} failed: ${String((lastErr as Error)?.message ?? lastErr)}`);
}

/** Deployment probe that separates "not deployed" from "the RPC misbehaved". */
async function snIsDeployed(address: string): Promise<{ deployed: boolean; note: string }> {
  const urls = snRpcUrls();
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const hash = await new RpcProvider({ nodeUrl: url }).getClassHashAt(address);
      return { deployed: Boolean(hash && BigInt(hash) !== 0n), note: '' };
    } catch (err) {
      lastErr = err;
      const blob = String((err as Error)?.message ?? err).toLowerCase();
      // A genuine "nothing here" answer, not an endpoint problem.
      if (blob.includes('contract not found') || blob.includes('20:')) {
        return { deployed: false, note: 'contract not found' };
      }
    }
  }
  return { deployed: false, note: `rpc error: ${String((lastErr as Error)?.message || lastErr).slice(0, 60)}` };
}

async function snUsdcBalance(address: string): Promise<bigint> {
  return u256FromResult(await snRead(SN_USDC, 'balance_of', [address]));
}

/**
 * Build a spec-shaped CCTP v2 message and assert decodeCctpMessage reads every
 * field back. Catches an offset slip in preflight instead of after a live burn,
 * where a wrong decode would look like a delivery failure.
 */
function assertMessageDecoder(): boolean {
  const header = Buffer.alloc(148);
  header.writeUInt32BE(1, 0); // version
  header.writeUInt32BE(BASE_SEPOLIA_DOMAIN, 4);
  header.writeUInt32BE(STARKNET_DOMAIN, 8);
  const nonce = Buffer.alloc(32, 0xab); // full 32-byte nonce
  nonce.copy(header, 12);
  const recipientFelt = Buffer.from(feltToBytes32(SN_MESSAGE_TRANSMITTER).slice(2), 'hex');
  recipientFelt.copy(header, 76);

  const body = Buffer.alloc(228);
  body.writeUInt32BE(1, 0); // burn message version
  const mintRecipient = Buffer.from(feltToBytes32(SN_USDC).slice(2), 'hex');
  mintRecipient.copy(body, 36);
  const amount = 1_234_567n;
  Buffer.from(amount.toString(16).padStart(64, '0'), 'hex').copy(body, 68);

  const decoded = decodeCctpMessage(`0x${Buffer.concat([header, body]).toString('hex')}`);
  const failures: string[] = [];
  if (decoded.version !== 1) failures.push(`version=${decoded.version}`);
  if (decoded.sourceDomain !== BASE_SEPOLIA_DOMAIN) failures.push(`sourceDomain=${decoded.sourceDomain}`);
  if (decoded.destinationDomain !== STARKNET_DOMAIN) failures.push(`destDomain=${decoded.destinationDomain}`);
  if (BigInt(decoded.nonce) !== BigInt(`0x${'ab'.repeat(32)}`)) failures.push(`nonce=${decoded.nonce}`);
  if (BigInt(decoded.recipient) !== BigInt(SN_MESSAGE_TRANSMITTER)) failures.push(`recipient=${decoded.recipient}`);
  if (BigInt(decoded.mintRecipient) !== BigInt(SN_USDC)) failures.push(`mintRecipient=${decoded.mintRecipient}`);
  if (decoded.amount !== amount) failures.push(`amount=${decoded.amount}`);
  if (failures.length) console.log(`  ${ok(false)} message decoder: ${failures.join(', ')}`);
  return failures.length === 0;
}

/** Prove hexToCairoByteArray matches starknet.js for text, and round-trips raw bytes. */
async function assertByteArrayEncoder(): Promise<boolean> {
  const { byteArray } = await import('starknet');
  let allGood = true;
  // Chosen to straddle the 31-byte word boundary: 0, short, exactly 31, 31+1, 62, 130.
  for (const sample of ['', 'USDC', 'a'.repeat(31), 'a'.repeat(32), 'a'.repeat(62), 'z'.repeat(130)]) {
    const mine = hexToCairoByteArray(`0x${Buffer.from(sample, 'utf8').toString('hex')}`);
    const theirs = byteArray.byteArrayFromString(sample) as unknown as CairoByteArray;
    const norm = (b: CairoByteArray) =>
      JSON.stringify({
        data: b.data.map((d) => BigInt(d).toString()),
        pending_word: BigInt(b.pending_word).toString(),
        pending_word_len: Number(b.pending_word_len),
      });
    const match = norm(mine) === norm(theirs);
    if (!match) {
      allGood = false;
      console.log(`  ${ok(false)} ByteArray mismatch for ${sample.length}-byte input`);
      console.log(`        mine:   ${norm(mine)}`);
      console.log(`        theirs: ${norm(theirs)}`);
    }
  }
  // Raw (non-UTF8) bytes must survive a round trip through the encoder.
  const raw = `0x${Buffer.from([0x00, 0xff, 0x80, 0x01, 0xfe]).toString('hex')}`;
  const rt = hexToCairoByteArray(raw);
  if (rt.pending_word_len !== 5 || BigInt(rt.pending_word) !== BigInt('0x00ff8001fe')) {
    allGood = false;
    console.log(`  ${ok(false)} raw-byte round trip: ${JSON.stringify(rt)}`);
  }
  return allGood;
}

// ── Preflight: everything checkable without keys or funds ───────────────────
async function preflight(): Promise<boolean> {
  console.log('\n═══ CCTP Starknet preflight (read-only) ═══\n');
  const p = snProvider();
  let pass = true;
  const check = (label: string, good: boolean, detail: string) => {
    if (!good) pass = false;
    console.log(`  ${ok(good)}  ${label.padEnd(34)} ${detail}`);
  };

  console.log('── encoding');
  const encoderOk = await assertByteArrayEncoder();
  check('Cairo ByteArray encoder', encoderOk, 'matches starknet.js on text + raw bytes');
  const padded = feltToBytes32(SN_MESSAGE_TRANSMITTER);
  check('felt -> bytes32 mintRecipient', padded.length === 66, padded);
  check('CCTP v2 message decoder', assertMessageDecoder(), 'all header + burn-body offsets');

  console.log('\n── starknet sepolia');
  const chainId = await p.getChainId();
  check('chain id', chainId === constants.StarknetChainId.SN_SEPOLIA, `${chainId} (SN_SEPOLIA)`);
  const block = await p.getBlockLatestAccepted();
  check('rpc reachable', block.block_number > 0, `block ${block.block_number}`);

  for (const [name, addr] of [
    ['MessageTransmitterV2', SN_MESSAGE_TRANSMITTER],
    ['TokenMessengerMinterV2', SN_TOKEN_MESSENGER_MINTER],
    ['USDC', SN_USDC],
  ] as const) {
    const { deployed, note } = await snIsDeployed(addr);
    check(`${name} deployed`, deployed, note ? `${addr}  (${note})` : addr);
  }

  console.log('\n── cctp wiring');
  const localDomain = Number(
    (await snRead(SN_MESSAGE_TRANSMITTER, 'get_local_domain', []))[0]
  );
  check('local domain', localDomain === STARKNET_DOMAIN, `${localDomain} (expected ${STARKNET_DOMAIN})`);

  const version = Number(
    (await snRead(SN_MESSAGE_TRANSMITTER, 'get_version', []))[0]
  );
  check('message version', version === 1, `${version} (CCTP v2)`);

  for (const [name, addr] of [
    ['MessageTransmitter', SN_MESSAGE_TRANSMITTER],
    ['TokenMessengerMinter', SN_TOKEN_MESSENGER_MINTER],
  ] as const) {
    const paused = BigInt((await snRead(addr, 'paused', []))[0]);
    check(`${name} not paused`, paused === 0n, paused === 0n ? 'active' : 'PAUSED');
  }

  const transmitter = (
    await snRead(SN_TOKEN_MESSENGER_MINTER, 'local_message_transmitter', [])
  )[0];
  check(
    'messenger -> transmitter link',
    BigInt(transmitter) === BigInt(SN_MESSAGE_TRANSMITTER),
    BigInt(transmitter) === BigInt(SN_MESSAGE_TRANSMITTER) ? 'correct' : transmitter
  );

  const remote = u256FromResult(
    await snRead(SN_TOKEN_MESSENGER_MINTER, 'remote_token_messenger', [`0x${BASE_SEPOLIA_DOMAIN.toString(16)}`])
  );
  const remoteHex = `0x${remote.toString(16)}`;
  check(
    'Base Sepolia (domain 6) remote',
    remote === BigInt(EVM_TOKEN_MESSENGER),
    `${remoteHex}${remote === BigInt(EVM_TOKEN_MESSENGER) ? ' = EVM TokenMessengerV2' : ''}`
  );

  const burnLimit = u256FromResult(
    await snRead(SN_TOKEN_MESSENGER_MINTER, 'get_burn_limit_per_message', [SN_USDC])
  );
  check('USDC burnable (outbound)', burnLimit > 0n, `limit ${fmt(burnLimit)} USDC/message`);

  const minFee = u256FromResult(
    await snRead(SN_TOKEN_MESSENGER_MINTER, 'min_fee', [SN_USDC])
  );
  check('USDC min fee', true, `${minFee} (maxFee floor)`);

  const decimals = Number(
    (await snRead(SN_USDC, 'decimals', []))[0]
  );
  check('USDC decimals', decimals === 6, `${decimals}`);

  console.log('\n── iris (circle sandbox)');
  const irisUp = await fetch(`${IRIS_API}/v2/messages/${STARKNET_DOMAIN}?transactionHash=0x0`)
    .then((r) => r.status < 500)
    .catch(() => false);
  check('attestation api reachable', irisUp, IRIS_API);

  console.log('\n── credentials');
  const snAddr = process.env.STARKNET_ACCOUNT_ADDRESS;
  const evmPk = process.env.PRIVATE_KEY;
  if (snAddr) {
    const probe = await snIsDeployed(snAddr);
    const deployed = probe.deployed;
    check(
      'starknet account deployed',
      deployed,
      deployed ? snAddr : `${snAddr}  (${probe.note || 'not deployed — send it funds once to deploy'})`
    );
    if (deployed) {
      const strk = u256FromResult(
        await snRead(SN_STRK, 'balance_of', [snAddr])
      );
      const usdc = await snUsdcBalance(snAddr);
      check('starknet STRK (gas)', strk > 0n, `${ethers.formatUnits(strk, 18)} STRK`);
      console.log(`  ....  ${'starknet USDC'.padEnd(34)} ${fmt(usdc)} USDC`);
    }
  } else {
    console.log(`  ....  ${'STARKNET_ACCOUNT_ADDRESS'.padEnd(34)} not set (needed for a live run)`);
  }
  if (evmPk) {
    const wallet = new ethers.Wallet(evmPk, baseProvider());
    const provider = baseProvider();
    const usdc = new ethers.Contract(USDC_BASE_SEPOLIA, ERC20_ABI, provider);
    const [bal, eth] = await Promise.all([
      usdc.balanceOf(wallet.address) as Promise<bigint>,
      provider.getBalance(wallet.address),
    ]);
    check('base sepolia ETH (gas)', eth > 0n, `${ethers.formatEther(eth)} ETH  (${wallet.address})`);
    check('base sepolia USDC', bal > 0n, `${fmt(bal)} USDC`);
  } else {
    console.log(`  ....  ${'PRIVATE_KEY'.padEnd(34)} not set (needed for a live run)`);
  }

  console.log(`\n${pass ? '\x1b[32m✅ preflight passed\x1b[0m' : '\x1b[31m❌ preflight failed\x1b[0m'}\n`);
  return pass;
}

// ── Direction: Base Sepolia -> Starknet Sepolia ─────────────────────────────
async function bridgeIn(amount: bigint): Promise<bigint> {
  const evmPk = process.env.PRIVATE_KEY;
  const snAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  const snPk = process.env.STARKNET_PRIVATE_KEY;
  if (!evmPk) throw new Error('PRIVATE_KEY required (funded Base Sepolia USDC + ETH)');
  if (!snAddress || !snPk) throw new Error('STARKNET_ACCOUNT_ADDRESS + STARKNET_PRIVATE_KEY required');

  const p = snProvider();
  const account = new Account({ provider: p, address: snAddress, signer: snPk, cairoVersion: '1' });
  const before = await snUsdcBalance(snAddress);

  console.log(`\n═══ IN: ${fmt(amount)} USDC  Base Sepolia -> Starknet Sepolia ═══`);
  console.log(`  recipient: ${snAddress}`);
  console.log(`  before:    ${fmt(before)} USDC\n`);

  // [1/4] burn on Base Sepolia, minting to the Starknet felt address.
  console.log('→ [1/4] burning on Base Sepolia');
  const wallet = new ethers.Wallet(evmPk, baseProvider());
  const usdc = new ethers.Contract(USDC_BASE_SEPOLIA, ERC20_ABI, wallet);
  const allowance = (await usdc.allowance(wallet.address, EVM_TOKEN_MESSENGER)) as bigint;
  if (allowance < amount) {
    const tx = await (usdc.approve as (s: string, a: bigint) => Promise<ethers.ContractTransactionResponse>)(
      EVM_TOKEN_MESSENGER,
      amount
    );
    await tx.wait();
    console.log(`     approved (${tx.hash})`);
  }
  const messenger = new ethers.Contract(EVM_TOKEN_MESSENGER, TOKEN_MESSENGER_ABI, wallet);
  const mintRecipient = feltToBytes32(snAddress);
  const burn = await (
    messenger.depositForBurn as (
      ...a: unknown[]
    ) => Promise<ethers.ContractTransactionResponse>
  )(
    amount,
    STARKNET_DOMAIN,
    mintRecipient,
    USDC_BASE_SEPOLIA,
    ethers.ZeroHash, // destinationCaller = 0 -> anyone may deliver
    (amount * MAX_FEE_BPS) / 10_000n,
    FAST_FINALITY
  );
  await burn.wait();
  console.log(`     burn: https://sepolia.basescan.org/tx/${burn.hash}`);

  // [2/4] Circle attestation.
  console.log('→ [2/4] waiting for Circle attestation');
  const att = await fetchAttestation(BASE_SEPOLIA_DOMAIN, burn.hash);
  const decoded = decodeCctpMessage(att.message);
  console.log(`     message: ${att.message.length / 2 - 1} bytes, attestation: ${att.attestation.length / 2 - 1} bytes`);
  console.log(`     domains: ${decoded.sourceDomain} -> ${decoded.destinationDomain}, nonce ${decoded.nonce}`);
  // The USDC is already burned. From here the ONLY way to recover it is to submit
  // receive_message, so decode mismatches are logged loudly and never abort —
  // aborting would strand funds mid-flight. The balance delta is the real verdict.
  if (decoded.destinationDomain !== STARKNET_DOMAIN) {
    console.warn(`     ⚠ destination domain ${decoded.destinationDomain} != ${STARKNET_DOMAIN} (decoder or route bug)`);
  }
  if (BigInt(decoded.mintRecipient) !== BigInt(snAddress)) {
    console.warn(`     ⚠ mintRecipient ${decoded.mintRecipient} != ${snAddress} (decoder or route bug)`);
  } else {
    console.log(`     mintRecipient matches the Starknet account, amount ${fmt(decoded.amount)} USDC`);
  }

  // [3/4] deliver on Starknet: receive_message(ByteArray, ByteArray).
  console.log('→ [3/4] calling receive_message on Starknet');
  const nonceUsedBefore = BigInt(
    (await snRead(SN_MESSAGE_TRANSMITTER, 'is_nonce_used', u256ToCalldata(BigInt(decoded.nonce))))[0]
  );
  if (nonceUsedBefore !== 0n) {
    console.log('     nonce already consumed — message was delivered earlier, skipping');
  } else {
    const calldata = [
      ...byteArrayToCalldata(hexToCairoByteArray(att.message)),
      ...byteArrayToCalldata(hexToCairoByteArray(att.attestation)),
    ];
    const { transaction_hash } = await account.execute({
      contractAddress: SN_MESSAGE_TRANSMITTER,
      entrypoint: 'receive_message',
      calldata,
    });
    console.log(`     mint: https://sepolia.starkscan.co/tx/${transaction_hash}`);
    await p.waitForTransaction(transaction_hash);
  }

  // [4/4] verify.
  console.log('→ [4/4] verifying balance');
  const after = await snUsdcBalance(snAddress);
  const delta = after - before;
  console.log(`     after: ${fmt(after)} USDC (received ${fmt(delta)})`);
  if (delta <= 0n) throw new Error('Starknet account did not receive USDC');
  console.log(`     CCTP fee taken: ${fmt(amount - delta)} USDC (${Number(amount - delta)} units)`);
  console.log('\n✅ IN leg complete: burned on Base Sepolia, minted on Starknet Sepolia.');
  return delta;
}

// ── Direction: Starknet Sepolia -> Base Sepolia ─────────────────────────────
async function bridgeOut(amountRequested: bigint): Promise<void> {
  let amount = amountRequested;
  const evmPk = process.env.PRIVATE_KEY;
  const snAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  const snPk = process.env.STARKNET_PRIVATE_KEY;
  if (!evmPk) throw new Error('PRIVATE_KEY required (Base Sepolia recipient + mint gas)');
  if (!snAddress || !snPk) throw new Error('STARKNET_ACCOUNT_ADDRESS + STARKNET_PRIVATE_KEY required');

  const p = snProvider();
  const account = new Account({ provider: p, address: snAddress, signer: snPk, cairoVersion: '1' });
  const recipient = new ethers.Wallet(evmPk).address;
  const baseUsdc = new ethers.Contract(USDC_BASE_SEPOLIA, ERC20_ABI, baseProvider());
  const before = (await baseUsdc.balanceOf(recipient)) as bigint;

  console.log(`\n═══ OUT: ${fmt(amount)} USDC  Starknet Sepolia -> Base Sepolia ═══`);
  console.log(`  recipient: ${recipient}`);
  console.log(`  before:    ${fmt(before)} USDC\n`);

  // Each CCTP leg takes a fee, so the exact nominal amount is never sitting there
  // after an inbound hop. Burn what's actually available — the same thing
  // state-machine.ts does in BRIDGING_OUT (it burns `bal`, not route.amount).
  const snBalance = await snUsdcBalance(snAddress);
  if (snBalance <= 0n) throw new Error('Starknet account holds no USDC to send back');
  if (snBalance < amount) {
    console.log(`  note: holding ${fmt(snBalance)} USDC (< ${fmt(amount)} requested), sending the full balance`);
    amount = snBalance;
  }

  // [1/4] approve + deposit_for_burn. Starknet has no reentrancy guard here, so
  // both calls go in ONE multicall — native AA, no bundler needed.
  console.log('→ [1/4] approve + deposit_for_burn on Starknet (one multicall)');
  const { transaction_hash: burnTx } = await account.execute([
    {
      contractAddress: SN_USDC,
      entrypoint: 'approve',
      calldata: [SN_TOKEN_MESSENGER_MINTER, ...u256ToCalldata(amount)],
    },
    {
      contractAddress: SN_TOKEN_MESSENGER_MINTER,
      entrypoint: 'deposit_for_burn',
      calldata: [
        ...u256ToCalldata(amount),
        `0x${BASE_SEPOLIA_DOMAIN.toString(16)}`,
        ...u256ToCalldata(BigInt(recipient)), // EVM address as u256
        // burn_token is a Starknet ContractAddress: the STARKNET USDC, never the
        // Base Sepolia one. Easy to get backwards when this moves into services/cctp.
        SN_USDC,
        ...u256ToCalldata(0n), // destinationCaller = anyone
        ...u256ToCalldata((amount * MAX_FEE_BPS) / 10_000n),
        `0x${FAST_FINALITY.toString(16)}`,
      ],
    },
  ]);
  console.log(`     burn: https://sepolia.starkscan.co/tx/${burnTx}`);
  await p.waitForTransaction(burnTx);

  // [2/4] attestation for source domain 25.
  console.log('→ [2/4] waiting for Circle attestation (source domain 25)');
  const att = await fetchAttestation(STARKNET_DOMAIN, burnTx);
  const decoded = decodeCctpMessage(att.message);
  console.log(`     domains: ${decoded.sourceDomain} -> ${decoded.destinationDomain}, nonce ${decoded.nonce}`);
  if (decoded.sourceDomain !== STARKNET_DOMAIN) {
    // Already burned on Starknet — warn, never abort (see the IN leg's note).
    console.warn(`     ⚠ source domain ${decoded.sourceDomain} != ${STARKNET_DOMAIN} (decoder or route bug)`);
  }

  // [3/4] mint on Base Sepolia — the existing production service handles this.
  console.log('→ [3/4] minting on Base Sepolia (via services/cctp cctpMint)');
  process.env.RPC_84532 = process.env.RPC_84532 || DEFAULT_BASE_RPC;
  const mint = await cctpMint({
    destChainId: BASE_SEPOLIA_CHAIN_ID,
    message: att.message,
    attestation: att.attestation,
    signerPrivateKey: evmPk,
  });
  console.log(`     mint: https://sepolia.basescan.org/tx/${mint.txHash}`);

  // [4/4] verify.
  console.log('→ [4/4] verifying balance');
  const after = (await baseUsdc.balanceOf(recipient)) as bigint;
  const delta = after - before;
  console.log(`     after: ${fmt(after)} USDC (received ${fmt(delta)})`);
  if (delta <= 0n) throw new Error('recipient did not receive USDC on Base Sepolia');
  console.log('\n✅ OUT leg complete: burned on Starknet Sepolia, minted on Base Sepolia.');
}

async function main() {
  const direction = arg('direction', has('preflight') ? 'preflight' : 'preflight');
  const amount = ethers.parseUnits(arg('amount', '0.5'), 6);

  const passed = await preflight();
  if (direction === 'preflight' || has('preflight')) {
    if (!passed) process.exit(1);
    console.log('Next: rerun with --direction=in|out|roundtrip once the credentials above are set.\n');
    process.exit(0);
  }
  if (!passed) throw new Error('preflight failed — refusing to move funds');

  if (direction === 'in') await bridgeIn(amount);
  else if (direction === 'out') await bridgeOut(amount);
  else if (direction === 'roundtrip') {
    const received = await bridgeIn(amount);
    await bridgeOut(received);
    console.log('\n✅ Round trip complete: Base Sepolia -> Starknet Sepolia -> Base Sepolia.');
  } else throw new Error(`unknown --direction=${direction} (use in | out | roundtrip | preflight)`);

  await new Promise<void>((res) => process.stdout.write('', () => res()));
  process.exit(0);
}

main().catch(async (e) => {
  console.error(`\n❌ CCTP Starknet test failed: ${(e as Error)?.message || e}`);
  await new Promise<void>((res) => process.stdout.write('', () => res()));
  process.exit(1);
});
