// Circle CCTP v2 bridge (native USDC burn -> mint). Unlike a liquidity-based
// bridge, CCTP burns USDC on the source chain and mints 1:1 on the destination
// via Circle's attestation service — no solver liquidity caps, no slippage.
//
// Flow: depositForBurn (source) -> poll Iris attestation -> receiveMessage (dest).
//
// Testnet (sandbox) uses one set of contract addresses across all chains.
import { ethers } from 'ethers';
import { logger } from '../../managers/log';
import { chainManager } from '../../managers/chain';

// CCTP v2 testnet contracts (identical on every supported testnet chain).
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const MESSAGE_TRANSMITTER_V2 = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275';
const IRIS_API = process.env.CCTP_IRIS_API || 'https://iris-api-sandbox.circle.com';

// EVM chainId -> CCTP domain id.
const CCTP_DOMAINS: Record<number, number> = {
  11155111: 0, // Ethereum Sepolia
  84532: 6, // Base Sepolia
  421614: 3, // Arbitrum Sepolia
  11155420: 2, // OP Sepolia
  80002: 7, // Polygon Amoy
  // mainnet
  1: 0,
  8453: 6,
  42161: 3,
};

// Finality thresholds: 1000 = Fast Transfer (confirmed), 2000 = standard (finalized).
const FAST_FINALITY = 1000;

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

export function cctpSupportsChain(chainId: number): boolean {
  return chainId in CCTP_DOMAINS;
}

export function cctpDomain(chainId: number): number {
  const d = CCTP_DOMAINS[chainId];
  if (d === undefined) throw new Error(`CCTP: unsupported chain ${chainId}`);
  return d;
}

/** Left-pad an EVM address to a bytes32 (CCTP mintRecipient / destinationCaller). */
export function addressToBytes32(address: string): string {
  return '0x' + '000000000000000000000000' + address.toLowerCase().replace(/^0x/, '');
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

  const usdc = new ethers.Contract(params.usdc, ERC20_ABI, wallet);
  const allowance: bigint = await usdc.allowance(wallet.address, TOKEN_MESSENGER_V2);
  if (allowance < params.amount) {
    const approveTx = await usdc.approve(TOKEN_MESSENGER_V2, params.amount);
    await approveTx.wait();
  }

  const maxFee = (params.amount * BigInt(params.maxFeeBps ?? 100)) / 10_000n;
  const tm = new ethers.Contract(TOKEN_MESSENGER_V2, TOKEN_MESSENGER_ABI, wallet);
  const tx = await tm.depositForBurn(
    params.amount,
    destDomain,
    addressToBytes32(params.mintRecipient),
    params.usdc,
    ethers.ZeroHash, // destinationCaller = anyone can mint
    maxFee,
    FAST_FINALITY
  );
  await tx.wait();
  logger.info(`CCTP burn ${params.sourceChainId}->${params.destChainId}: ${tx.hash}`, 'CCTP');
  return { txHash: tx.hash };
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

/** Mint the bridged USDC on the destination chain by submitting the attestation. */
export async function cctpMint(params: {
  destChainId: number;
  message: string;
  attestation: string;
  signerPrivateKey: string;
}): Promise<{ txHash: string }> {
  const provider = providerFor(params.destChainId);
  const wallet = new ethers.Wallet(params.signerPrivateKey, provider);
  const mt = new ethers.Contract(MESSAGE_TRANSMITTER_V2, MESSAGE_TRANSMITTER_ABI, wallet);
  const tx = await mt.receiveMessage(params.message, params.attestation);
  await tx.wait();
  logger.info(`CCTP mint on ${params.destChainId}: ${tx.hash}`, 'CCTP');
  return { txHash: tx.hash };
}
