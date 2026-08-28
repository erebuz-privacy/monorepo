// CCTP v2 on Starknet (domain 25) — the non-EVM half of the bridge.
//
// Starknet differs from every EVM chain in services/cctp/index.ts in three ways,
// all of them load-bearing:
//   1. TokenMessengerV2 + TokenMinterV2 are ONE contract (TokenMessengerMinterV2).
//   2. `message` / `attestation` are Cairo `ByteArray`s, not EVM `bytes`.
//   3. Addresses are 252-bit felts, so a bytes32 mintRecipient is a plain
//      left-pad — NOT the 12-zero-bytes + 20-byte-address pad addressToBytes32
//      does for EVM.
//
// Validated end to end on testnet by `pnpm --filter @erebuz/tee test:cctp:starknet`
// (Base Sepolia -> Starknet Sepolia -> Base Sepolia, real USDC, real attestations).
//
// Starknet is intentionally NOT registered with chainManager: that manager builds
// viem clients and would throw for a non-EVM chain. Everything here uses
// starknet.js against its own RPC pool.

import { Account, RpcProvider } from 'starknet';
import { logger } from '../../managers/log';

export const STARKNET_DOMAIN = 25;
/** Synthetic chain id for Starknet Sepolia. Starknet has no EIP-155 id; this is
 *  the key we use in CCTP_CHAINS and over the API. Chosen to not collide with
 *  any real chain id. */
export const STARKNET_SEPOLIA_CHAIN_ID = 23_448_594;

export const SN_TOKEN_MESSENGER_MINTER =
  '0x04bdde1e09a4b09a2f95d893d94a967b7717eb85a3f6deca8c080ee01fbc3370';
export const SN_MESSAGE_TRANSMITTER =
  '0x04db7926c64f1f32a840f3fa95cb551f3801a3600bae87af87807a54dce12fe8';
export const SN_USDC = '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343';
export const SN_STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

// Public Starknet RPCs load-balance across nodes with uneven method support and
// intermittently answer -32601 "starknet_call does not exist", so reads retry
// across endpoints. Same class of problem as Arc's rate limiting.
const DEFAULT_RPCS = [
  'https://api.cartridge.gg/x/starknet/sepolia',
  'https://starknet-sepolia.drpc.org',
];

function rpcUrls(): string[] {
  const override = process.env.STARKNET_RPC_URL?.trim();
  return override ? [override, ...DEFAULT_RPCS.filter((u) => u !== override)] : DEFAULT_RPCS;
}

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

/** A read that survives one endpoint answering nonsense. Real reverts still throw. */
export async function starknetRead(
  contractAddress: string,
  entrypoint: string,
  calldata: string[] = []
): Promise<string[]> {
  const urls = rpcUrls();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of urls) {
      try {
        return await new RpcProvider({ nodeUrl: url }).callContract({
          contractAddress,
          entrypoint,
          calldata,
        });
      } catch (err) {
        lastErr = err;
        if (!isTransientRpcError(err)) throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error(
    `starknet ${entrypoint} failed: ${String((lastErr as Error)?.message ?? lastErr).slice(0, 140)}`
  );
}

// ── Cairo encoding ─────────────────────────────────────────────────────────

const BYTES_PER_WORD = 31;

export interface CairoByteArray {
  data: string[];
  pending_word: string;
  pending_word_len: number;
}

/**
 * Cairo `ByteArray` from raw hex. Serializes as [data.len, ...data, pending_word,
 * pending_word_len] with 31 raw bytes per `data` word (big-endian) and the tail in
 * pending_word. CCTP messages are raw bytes, NOT text, so starknet.js's
 * byteArrayFromString cannot be used — it would re-encode the hex characters.
 */
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
  return [
    `0x${ba.data.length.toString(16)}`,
    ...ba.data,
    ba.pending_word,
    `0x${ba.pending_word_len.toString(16)}`,
  ];
}

/** Split a u256 into the [low, high] felt pair Cairo calldata uses. */
export function u256ToCalldata(value: bigint): [string, string] {
  const mask = (1n << 128n) - 1n;
  return [`0x${(value & mask).toString(16)}`, `0x${(value >> 128n).toString(16)}`];
}

export function u256FromResult(result: string[]): bigint {
  return (BigInt(result[1]) << 128n) | BigInt(result[0]);
}

/**
 * A felt as an EVM bytes32 — plain left-pad, all 32 bytes usable. Used for a CCTP
 * mintRecipient when the DESTINATION is Starknet.
 */
export function feltToBytes32(felt: string): string {
  const clean = felt.startsWith('0x') ? felt.slice(2) : felt;
  if (clean.length > 64) throw new Error(`felt ${felt} does not fit in 32 bytes`);
  return `0x${clean.padStart(64, '0')}`;
}

/** A plausible Starknet address: a felt below the field modulus, non-zero. */
const STARK_FIELD =
  0x800000000000011000000000000000000000000000000000000000000000001n;
export function isStarknetAddress(value: string): boolean {
  const v = value.trim();
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(v)) return false;
  const n = BigInt(v);
  return n > 0n && n < STARK_FIELD;
}

/** Normalize a Starknet address to 0x + 64 lowercase hex, so storage/compares are stable. */
export function normalizeStarknetAddress(value: string): string {
  if (!isStarknetAddress(value)) throw new Error(`invalid Starknet address: ${value}`);
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
}

// ── Account / balances ─────────────────────────────────────────────────────

/** The TEE's own Starknet account — pays STRK gas to deliver mints. */
export function starknetSignerReady(): boolean {
  return Boolean(process.env.STARKNET_ACCOUNT_ADDRESS && process.env.STARKNET_PRIVATE_KEY);
}

function starknetAccount(): { account: Account; provider: RpcProvider } {
  const address = process.env.STARKNET_ACCOUNT_ADDRESS;
  const pk = process.env.STARKNET_PRIVATE_KEY;
  if (!address || !pk) {
    throw new Error('STARKNET_ACCOUNT_ADDRESS + STARKNET_PRIVATE_KEY required for Starknet CCTP');
  }
  const provider = new RpcProvider({ nodeUrl: rpcUrls()[0] });
  return {
    account: new Account({ provider, address, signer: pk, cairoVersion: '1' }),
    provider,
  };
}

/**
 * The TEE-owned Starknet account that acts as the hub for STRK20 routes.
 *
 * MUST be used instead of aa/deriveHubAddress for a Starknet hub. deriveHubAddress
 * falls back to the TEE's EVM EOA when a chain has no Nexus stack, which for a
 * Cairo chain yields a 20-byte EVM address used as a felt — an address nobody can
 * ever sign for. That mistake permanently burned a CCTP mint once; hence the
 * shape assertion below.
 */
export function starknetHubAccount(): string {
  const raw = process.env.STARKNET_ACCOUNT_ADDRESS?.trim();
  if (!raw) throw new Error('STARKNET_ACCOUNT_ADDRESS is required for Starknet-hub routes');
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(
      `STARKNET_ACCOUNT_ADDRESS ${raw} looks like a 20-byte EVM address, not a Starknet felt. ` +
        `Minting to it would send funds to an address nobody controls.`
    );
  }
  return normalizeStarknetAddress(raw);
}

export async function starknetUsdcBalance(address: string): Promise<bigint> {
  return u256FromResult(await starknetRead(SN_USDC, 'balance_of', [address]));
}

export async function starknetStrkBalance(address: string): Promise<bigint> {
  return u256FromResult(await starknetRead(SN_STRK, 'balance_of', [address]));
}

/** Has this CCTP message already been delivered on Starknet? Keeps mints idempotent. */
export async function starknetNonceUsed(nonce: string): Promise<boolean> {
  const r = await starknetRead(
    SN_MESSAGE_TRANSMITTER,
    'is_nonce_used',
    u256ToCalldata(BigInt(nonce))
  );
  return BigInt(r[0]) !== 0n;
}

// ── Mint (deliver an attested message on Starknet) ──────────────────────────

/**
 * Submit an attested CCTP message on Starknet, minting USDC to the mintRecipient
 * baked into the message. destinationCaller is 0 on our burns, so the TEE's own
 * account may deliver any route's message; it only pays the STRK gas.
 */
export async function starknetCctpMint(params: {
  message: string;
  attestation: string;
}): Promise<{ txHash: string }> {
  const { account, provider } = starknetAccount();
  const calldata = [
    ...byteArrayToCalldata(hexToCairoByteArray(params.message)),
    ...byteArrayToCalldata(hexToCairoByteArray(params.attestation)),
  ];
  const { transaction_hash } = await account.execute({
    contractAddress: SN_MESSAGE_TRANSMITTER,
    entrypoint: 'receive_message',
    calldata,
  });
  await provider.waitForTransaction(transaction_hash);
  logger.info(`CCTP mint on Starknet: ${transaction_hash}`, 'CCTP');
  return { txHash: transaction_hash };
}

// ── Burn (Starknet as a source/hub — not used while Starknet is dest-only) ──

/**
 * Burn USDC on Starknet toward an EVM destination. Native account abstraction
 * lets approve + deposit_for_burn share ONE transaction (no bundler, unlike the
 * Nexus UserOp path on EVM).
 *
 * Unused while Starknet is destination-only; kept because it is validated by the
 * harness and is what a Starknet source/hub mode would build on.
 */
export async function starknetCctpBurn(params: {
  destDomain: number;
  amount: bigint;
  /** EVM address or felt, as a plain hex string. */
  mintRecipient: string;
  maxFeeBps?: number;
  minFinalityThreshold: number;
}): Promise<{ txHash: string }> {
  const { account, provider } = starknetAccount();
  const maxFee = (params.amount * BigInt(params.maxFeeBps ?? 100)) / 10_000n;
  const { transaction_hash } = await account.execute([
    {
      contractAddress: SN_USDC,
      entrypoint: 'approve',
      calldata: [SN_TOKEN_MESSENGER_MINTER, ...u256ToCalldata(params.amount)],
    },
    {
      contractAddress: SN_TOKEN_MESSENGER_MINTER,
      entrypoint: 'deposit_for_burn',
      calldata: [
        ...u256ToCalldata(params.amount),
        `0x${params.destDomain.toString(16)}`,
        ...u256ToCalldata(BigInt(params.mintRecipient)),
        SN_USDC, // burn_token is the STARKNET USDC, never the destination's
        ...u256ToCalldata(0n), // destinationCaller = anyone may deliver
        ...u256ToCalldata(maxFee),
        `0x${params.minFinalityThreshold.toString(16)}`,
      ],
    },
  ]);
  await provider.waitForTransaction(transaction_hash);
  logger.info(`CCTP burn on Starknet -> domain ${params.destDomain}: ${transaction_hash}`, 'CCTP');
  return { txHash: transaction_hash };
}
