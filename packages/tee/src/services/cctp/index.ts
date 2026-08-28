// Circle CCTP v2 bridge (native USDC burn -> mint). Unlike a liquidity-based
// bridge, CCTP burns USDC on the source chain and mints 1:1 on the destination
// via Circle's attestation service — no solver liquidity caps, no slippage.
//
// Flow: depositForBurn (source) -> poll Iris attestation -> receiveMessage (dest).
//
// Testnet (sandbox) uses one set of contract addresses across all chains.
import { ethers } from 'ethers';
import { isAddress } from 'viem';
import { logger } from '../../managers/log';
import { chainManager } from '../../managers/chain';
import { PRIVACY_HUB_CHAIN_ID } from '../../config/global-config';
import {
  STARKNET_DOMAIN,
  STARKNET_SEPOLIA_CHAIN_ID,
  SN_USDC,
  feltToBytes32,
  isStarknetAddress,
  starknetCctpMint,
  starknetUsdcBalance,
} from './starknet';

// CCTP v2 contracts. Testnet uses one set across every chain; mainnet another.
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const MESSAGE_TRANSMITTER_V2 = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';
const IRIS_API = process.env.CCTP_IRIS_API || 'https://iris-api-sandbox.circle.com';

// Finality thresholds: 1000 = Fast Transfer, 2000 = standard (finalized). Fast
// Transfer isn't offered when the SOURCE chain has instant finality — Circle
// treats those as standard, which is already fast — so we burn them at 2000.
const FAST_FINALITY = 1000;
const STANDARD_FINALITY = 2000;

interface CctpChainInfo {
  domain: number;
  usdc: string;
  name: string;
  testnet: boolean;
  /** Instant-finality chains (Avalanche, Polygon, Sonic, Sei…) burn at STANDARD_FINALITY. */
  instantFinality?: boolean;
  /**
   * VM family. Everything defaults to 'evm'; 'starknet' rows are Cairo and must
   * NOT go through chainManager (it builds viem clients and would throw). Their
   * burns/mints route through ./starknet instead.
   */
  vm?: 'evm' | 'starknet';
}

// Single source of truth for CCTP chains. Only chains with a VERIFIED USDC address
// + Biconomy Nexus deployed (for per-route source accounts) + a working RPC are
// enabled; add more here as they're verified. Domains per Circle's docs.
const CCTP_CHAINS: Record<number, CctpChainInfo> = {
  // ---- testnet ----
  11155111: { domain: 0, usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', name: 'Ethereum Sepolia', testnet: true },
  84532: { domain: 6, usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'Base Sepolia', testnet: true },
  421614: { domain: 3, usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', name: 'Arbitrum Sepolia', testnet: true },
  11155420: { domain: 2, usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', name: 'OP Sepolia', testnet: true },
  80002: { domain: 7, usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', name: 'Polygon Amoy', testnet: true, instantFinality: true },
  1301: { domain: 10, usdc: '0x31d0220469e10c4E71834a79b1f276d740d3768F', name: 'Unichain Sepolia', testnet: true },
  4801: { domain: 14, usdc: '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88', name: 'World Chain Sepolia', testnet: true },
  1328: { domain: 16, usdc: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED', name: 'Sei Atlantic-2', testnet: true, instantFinality: true },
  // Arc: Circle's L1. USDC is the native gas token (fund the relayer with USDC, not
  // ETH); ERC-20 USDC interface at 0x3600… (6dp). Deterministic finality => standard.
  5042002: { domain: 26, usdc: '0x3600000000000000000000000000000000000000', name: 'Arc Testnet', testnet: true, instantFinality: true },
  // Starknet Sepolia: non-EVM (Cairo). Destination-only for now — our per-route
  // source deposit addresses are Nexus smart accounts, which don't exist here.
  // Validated end to end by scripts/test-cctp-starknet.ts.
  [STARKNET_SEPOLIA_CHAIN_ID]: {
    domain: STARKNET_DOMAIN,
    usdc: SN_USDC,
    name: 'Starknet Sepolia',
    testnet: true,
    vm: 'starknet',
  },
  // ---- mainnet ----
  1: { domain: 0, usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', name: 'Ethereum', testnet: false },
  8453: { domain: 6, usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'Base', testnet: false },
  42161: { domain: 3, usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', name: 'Arbitrum', testnet: false },
};

export function cctpSupportsChain(chainId: number): boolean {
  return chainId in CCTP_CHAINS;
}

/** True when a chain belongs to the same Circle environment as the selected hub. */
export function cctpSupportsChainForHub(chainId: number, hubChainId = PRIVACY_HUB_CHAIN_ID): boolean {
  const chain = CCTP_CHAINS[chainId];
  const hub = CCTP_CHAINS[hubChainId];
  return Boolean(chain && hub && chain.testnet === hub.testnet);
}

export function cctpDomain(chainId: number): number {
  const c = CCTP_CHAINS[chainId];
  if (!c) throw new Error(`CCTP: unsupported chain ${chainId}`);
  return c.domain;
}

export function cctpUsdc(chainId: number): string {
  const c = CCTP_CHAINS[chainId];
  if (!c) throw new Error(`CCTP: no USDC configured for chain ${chainId}`);
  return c.usdc;
}

export function cctpChainName(chainId: number): string {
  return CCTP_CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}

/** VM family for a CCTP chain. Defaults to 'evm'. */
export function cctpVm(chainId: number): 'evm' | 'starknet' {
  return CCTP_CHAINS[chainId]?.vm ?? 'evm';
}

export function cctpIsStarknet(chainId: number): boolean {
  return cctpVm(chainId) === 'starknet';
}

/**
 * Can this chain be a route SOURCE? Source deposits land on a per-route Nexus
 * smart account, which only exists on EVM chains — so non-EVM rows are
 * destination-only until a per-route Starknet-account deposit mode is built.
 */
export function cctpCanBeSource(chainId: number): boolean {
  return cctpVm(chainId) === 'evm';
}

/** Validate a recipient against the destination chain's address format. */
export function cctpValidRecipient(chainId: number, address: string): boolean {
  return cctpIsStarknet(chainId) ? isStarknetAddress(address) : isAddress(address);
}

/**
 * Circle's ACTUAL fast-transfer fee for a (source -> dest) pair, in bps.
 *
 * This replaces a hardcoded estimate. The published values are wildly asymmetric
 * and a fixed constant cannot cover them: measured on testnet, Ethereum Sepolia
 * -> anywhere is 1 bps and Arc -> anywhere is 0, but Starknet -> anywhere is 14.
 * Quoting 3 bps against a 14 bps leg would break `delivered >= quoted`.
 *
 * Cached in-process (quotes run on every keystroke) and falls back to a
 * conservative ceiling if Circle is unreachable, so a quote never under-promises.
 */
const FEE_CACHE_TTL_MS = 10 * 60 * 1000;
const FEE_FALLBACK_BPS = 20n; // above every observed value, incl. Starknet's 14
const feeCache = new Map<string, { bps: bigint; at: number }>();

export async function cctpFeeBps(sourceChainId: number, destChainId: number): Promise<bigint> {
  const srcDomain = cctpDomain(sourceChainId);
  const dstDomain = cctpDomain(destChainId);
  // Same domain means there is no CCTP hop at all — the state machine transfers
  // straight from the hub account to the recipient (see BRIDGING_OUT). Charging a
  // bridge fee for a leg that never happens would understate the quoted output.
  if (srcDomain === dstDomain) return 0n;
  const finality = cctpFinality(sourceChainId);
  const key = `${srcDomain}:${dstDomain}:${finality}`;

  const hit = feeCache.get(key);
  if (hit && Date.now() - hit.at < FEE_CACHE_TTL_MS) return hit.bps;

  try {
    const res = await fetch(`${IRIS_API}/v2/burn/USDC/fees/${srcDomain}/${dstDomain}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ finalityThreshold?: number; minimumFee?: number }>;
      const row = rows.find((r) => r.finalityThreshold === finality);
      if (row && typeof row.minimumFee === 'number') {
        // Round UP: a fractional bps (Base->Starknet is 1.3) must never round
        // down, or the quote promises more than CCTP will deliver.
        const bps = BigInt(Math.ceil(row.minimumFee));
        feeCache.set(key, { bps, at: Date.now() });
        return bps;
      }
    }
    logger.warn(`CCTP fee lookup ${key} returned no usable row; using ${FEE_FALLBACK_BPS} bps`, 'CCTP');
  } catch (e) {
    logger.warn(
      `CCTP fee lookup ${key} failed (${String((e as Error)?.message ?? e)}); using ${FEE_FALLBACK_BPS} bps`,
      'CCTP'
    );
  }
  feeCache.set(key, { bps: FEE_FALLBACK_BPS, at: Date.now() });
  return FEE_FALLBACK_BPS;
}

/** minFinalityThreshold for a burn ON the given source chain. */
function cctpFinality(sourceChainId: number): number {
  return CCTP_CHAINS[sourceChainId]?.instantFinality ? STANDARD_FINALITY : FAST_FINALITY;
}

/**
 * Chains available in CCTP mode, as the app's chain-picker list expects. Filtered
 * to the privacy hub's network class (a testnet hub only offers testnet chains).
 */
export function cctpChains(
  hubChainId = PRIVACY_HUB_CHAIN_ID
): Array<{
  chainId: number;
  name: string;
  displayName: string;
  vmType: string;
  canBeSource: boolean;
}> {
  const hubIsTestnet = CCTP_CHAINS[hubChainId]?.testnet ?? true;
  return Object.entries(CCTP_CHAINS)
    .filter(([, info]) => info.testnet === hubIsTestnet)
    .map(([id, info]) => ({
      chainId: Number(id),
      name: info.name,
      displayName: info.name,
      vmType: info.vm ?? 'evm',
      // Destination-only chains still belong in the list; the UI greys them out
      // as a source instead of failing at create time.
      canBeSource: (info.vm ?? 'evm') === 'evm',
    }));
}

const TOKEN_MESSENGER_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64)',
];
const MESSAGE_TRANSMITTER_ABI = [
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
];
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Typed views over the ethers Contracts (string ABIs are otherwise `any`, which
// trips no-unsafe-* lint on .wait()/.hash). Only the methods we call are declared.
type TxResp = ethers.ContractTransactionResponse;
interface Erc20Contract extends ethers.BaseContract {
  allowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<TxResp>;
}
interface TokenMessengerContract extends ethers.BaseContract {
  depositForBurn(
    amount: bigint,
    destinationDomain: number,
    mintRecipient: string,
    burnToken: string,
    destinationCaller: string,
    maxFee: bigint,
    minFinalityThreshold: number
  ): Promise<TxResp>;
}
interface MessageTransmitterContract extends ethers.BaseContract {
  receiveMessage(message: string, attestation: string): Promise<TxResp>;
}

/**
 * Left-pad an address to a bytes32 (CCTP mintRecipient / destinationCaller).
 *
 * Generic pad, NOT the old fixed 12-zero-bytes + 20-byte form: a Starknet felt is
 * 252 bits and uses nearly all 32 bytes, so hardcoding the EVM width would
 * silently truncate it and burn funds to an address nobody controls.
 */
/**
 * Refuse to burn toward a Cairo chain with a 20-byte EVM-shaped recipient.
 *
 * A CCTP mint is irreversible, and a Starknet address is derived from a class
 * hash + salt + constructor — never from an EVM key — so an EVM address used as a
 * felt is an address NOBODY can sign for. This exact mistake permanently burned a
 * testnet mint (deriveHubAddress silently returned the TEE's EOA for a Starknet
 * hub), so the shape is asserted at the last point before the burn is encoded.
 */
export function assertMintRecipientShape(destChainId: number, mintRecipient: string): void {
  if (!cctpIsStarknet(destChainId)) return;
  if (/^0x[0-9a-fA-F]{40}$/.test(mintRecipient.trim())) {
    throw new Error(
      `Refusing to burn to Starknet: mintRecipient ${mintRecipient} is a 20-byte EVM address, ` +
        `not a Starknet felt. Those funds would be unspendable.`
    );
  }
  if (!isStarknetAddress(mintRecipient.trim())) {
    throw new Error(`Refusing to burn to Starknet: mintRecipient ${mintRecipient} is not a valid felt.`);
  }
}

export function addressToBytes32(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, '');
  if (clean.length > 64) throw new Error(`address ${address} does not fit in bytes32`);
  return `0x${clean.padStart(64, '0')}`;
}

function providerFor(chainId: number): ethers.JsonRpcProvider {
  const envRpc = process.env[`RAILGUN_RPC_${chainId}`] || process.env[`RPC_${chainId}`];
  const chain = chainManager.getChain(chainId);
  const url = envRpc || (chain as unknown as { url?: string } | undefined)?.url;
  if (!url) throw new Error(`CCTP: no RPC for chain ${chainId}`);
  return new ethers.JsonRpcProvider(url);
}

/**
 * Burn USDC on the source chain to be minted to `mintRecipient` on the dest chain.
 * Approves the TokenMessenger if needed, then calls depositForBurn (Fast Transfer).
 * Returns the burn tx hash (used to fetch the attestation).
 */
export async function cctpBurn(params: {
  sourceChainId: number;
  destChainId: number;
  usdc: string;
  amount: bigint;
  mintRecipient: string;
  signerPrivateKey: string;
  maxFeeBps?: number; // fast-transfer fee cap in bps of amount (default 100 = 1%)
}): Promise<{ txHash: string }> {
  const provider = providerFor(params.sourceChainId);
  const wallet = new ethers.Wallet(params.signerPrivateKey, provider);
  const destDomain = cctpDomain(params.destChainId);

  const usdc = new ethers.Contract(params.usdc, ERC20_ABI, wallet) as unknown as Erc20Contract;
  const allowance = await usdc.allowance(wallet.address, TOKEN_MESSENGER_V2);
  if (allowance < params.amount) {
    const approveTx = await usdc.approve(TOKEN_MESSENGER_V2, params.amount);
    await approveTx.wait();
  }

  const maxFee = (params.amount * BigInt(params.maxFeeBps ?? 100)) / 10_000n;
  const tm = new ethers.Contract(TOKEN_MESSENGER_V2, TOKEN_MESSENGER_ABI, wallet) as unknown as TokenMessengerContract;
  const tx = await tm.depositForBurn(
    params.amount,
    destDomain,
    addressToBytes32(params.mintRecipient),
    params.usdc,
    ethers.ZeroHash, // destinationCaller = anyone can mint
    maxFee,
    cctpFinality(params.sourceChainId)
  );
  await tx.wait();
  logger.info(`CCTP burn ${params.sourceChainId}->${params.destChainId}: ${tx.hash}`, 'CCTP');
  return { txHash: tx.hash };
}

/**
 * Build the [approve, depositForBurn] calls for a CCTP burn, to be executed by a
 * smart account via executeBatch (the per-route TEE hub/source accounts). USDC is
 * the only bridged asset; a swap provider handles USDC<->other-token conversion.
 */
export function buildCctpBurnCalls(params: {
  sourceChainId: number;
  destChainId: number;
  usdc: string;
  amount: bigint;
  mintRecipient: string;
  maxFeeBps?: number;
}): Array<{ to: `0x${string}`; data: `0x${string}` }> {
  const destDomain = cctpDomain(params.destChainId);
  assertMintRecipientShape(params.destChainId, params.mintRecipient);
  const maxFee = (params.amount * BigInt(params.maxFeeBps ?? 100)) / 10_000n;
  const erc20 = new ethers.Interface(ERC20_ABI);
  const tm = new ethers.Interface(TOKEN_MESSENGER_ABI);
  return [
    {
      to: params.usdc as `0x${string}`,
      data: erc20.encodeFunctionData('approve', [TOKEN_MESSENGER_V2, params.amount]) as `0x${string}`,
    },
    {
      to: TOKEN_MESSENGER_V2 as `0x${string}`,
      data: tm.encodeFunctionData('depositForBurn', [
        params.amount,
        destDomain,
        addressToBytes32(params.mintRecipient),
        params.usdc,
        ethers.ZeroHash,
        maxFee,
        cctpFinality(params.sourceChainId),
      ]) as `0x${string}`,
    },
  ];
}

/**
 * Poll Circle's Iris attestation service until the burn is attested. Returns the
 * message bytes + attestation signature needed for receiveMessage on the dest.
 */
export async function cctpFetchAttestation(params: {
  sourceChainId: number;
  burnTxHash: string;
  timeoutMs?: number;
  onPoll?: (status: string) => void;
}): Promise<{ message: string; attestation: string } | null> {
  const srcDomain = cctpDomain(params.sourceChainId);
  const url = `${IRIS_API}/v2/messages/${srcDomain}?transactionHash=${params.burnTxHash}`;
  const deadline = Date.now() + (params.timeoutMs ?? 900_000);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          messages?: Array<{ status?: string; message?: string; attestation?: string }>;
        };
        const m = data.messages?.[0];
        params.onPoll?.(m?.status ?? 'pending');
        if (m && m.status === 'complete' && m.attestation && m.attestation !== 'PENDING' && m.message) {
          return { message: m.message, attestation: m.attestation };
        }
      }
    } catch {
      // transient; keep polling
    }
    await new Promise((r) => setTimeout(r, 6_000));
  }
  return null;
}

/** Single-shot attestation check (for the per-tick state machine). Null if not ready. */
export async function cctpTryAttestation(params: {
  sourceChainId: number;
  burnTxHash: string;
}): Promise<{ message: string; attestation: string } | null> {
  const srcDomain = cctpDomain(params.sourceChainId);
  try {
    const res = await fetch(`${IRIS_API}/v2/messages/${srcDomain}?transactionHash=${params.burnTxHash}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      messages?: Array<{ status?: string; message?: string; attestation?: string }>;
    };
    const m = data.messages?.[0];
    if (m && m.status === 'complete' && m.attestation && m.attestation !== 'PENDING' && m.message) {
      return { message: m.message, attestation: m.attestation };
    }
  } catch {
    /* transient */
  }
  return null;
}

/** Mint the bridged USDC on the destination chain by submitting the attestation. */
export async function cctpMint(params: {
  destChainId: number;
  message: string;
  attestation: string;
  signerPrivateKey: string;
}): Promise<{ txHash: string }> {
  // Non-EVM destination: deliver through the Cairo MessageTransmitter instead.
  // Gas is STRK from the TEE's own Starknet account, not signerPrivateKey.
  if (cctpIsStarknet(params.destChainId)) {
    return starknetCctpMint({ message: params.message, attestation: params.attestation });
  }
  const provider = providerFor(params.destChainId);
  const wallet = new ethers.Wallet(params.signerPrivateKey, provider);
  const mt = new ethers.Contract(MESSAGE_TRANSMITTER_V2, MESSAGE_TRANSMITTER_ABI, wallet) as unknown as MessageTransmitterContract;
  const tx = await mt.receiveMessage(params.message, params.attestation);
  await tx.wait();
  logger.info(`CCTP mint on ${params.destChainId}: ${tx.hash}`, 'CCTP');
  return { txHash: tx.hash };
}

/**
 * USDC balance of `address` on a CCTP chain, whichever VM it is. The state
 * machine needs one call site: chainManager only speaks viem/EVM.
 */
export async function cctpUsdcBalance(chainId: number, address: string): Promise<bigint> {
  if (cctpIsStarknet(chainId)) return starknetUsdcBalance(address);
  const provider = providerFor(chainId);
  const usdc = new ethers.Contract(
    cctpUsdc(chainId),
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  return (await usdc.balanceOf(address)) as bigint;
}

/** bytes32 mintRecipient for a destination chain, in that chain's address format. */
export function cctpMintRecipient(destChainId: number, address: string): string {
  return cctpIsStarknet(destChainId) ? feltToBytes32(address) : addressToBytes32(address);
}
