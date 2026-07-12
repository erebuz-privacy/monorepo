// Move funds OUT of a TEE-owned Nexus hub account via the transfer module,
// authorized by a TEE EIP-712 signature. Mirrors deposit-monitor's executeModule
// (src/services/deposit-monitor/index.ts:240) — the established way to extract
// funds from a Nexus smart account without a bundler.
//
// Requires the transfer module to be deployed with our teeSigner and set in
// NEAR_INTENT_BRIDGE_* for the chain; otherwise returns { success:false }.

import type { Address, Hex } from 'viem';
import { chainManager } from '../managers/chain';
import { logger } from '../managers/log';
import { NEAR_INTENT_BRIDGE_MODULE } from '../config/global-config';
import { getEIP712Signer, createExecuteTransferData } from '../services/eip712-signer';

const SIGNATURE_VALIDITY_SECONDS = 3600;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MODULE_ABI = [
  {
    type: 'function',
    name: 'executeNonces',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'account', type: 'address' },
      { name: 'expiry', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export interface HubTransferResult {
  success: boolean;
  txHash?: Hex;
  error?: string;
  /** True when the module isn't configured — a "not ready" pause, not a hard failure. */
  notReady?: boolean;
}

/**
 * Transfer `amount` of `tokenAddress` from the hub smart `account` to `to`,
 * signed by the TEE (the module's trusted teeSigner).
 */
export async function transferFromHubAccount(
  chainId: number,
  account: Address,
  tokenAddress: Address,
  amount: bigint,
  to: Address
): Promise<HubTransferResult> {
  try {
    const moduleAddress = NEAR_INTENT_BRIDGE_MODULE[chainId];
    if (!moduleAddress || moduleAddress === ZERO_ADDRESS) {
      return { success: false, notReady: true, error: `Transfer module not configured for chain ${chainId}` };
    }

    const chain = chainManager.getChain(chainId);
    if (!chain) return { success: false, error: `Chain ${chainId} not supported` };

    const publicClient = chain.getPublicClient();
    const walletClient = chain.getWallet();
    if (!walletClient.account) return { success: false, error: 'Wallet client has no account' };

    const nonce = (await publicClient.readContract({
      address: moduleAddress,
      abi: MODULE_ABI,
      functionName: 'executeNonces',
      args: [account],
    })) as bigint;

    const signer = getEIP712Signer();
    const transferData = createExecuteTransferData(
      account,
      tokenAddress,
      amount,
      to,
      SIGNATURE_VALIDITY_SECONDS,
      nonce
    );
    const signedTransfer = await signer.signExecuteTransfer(chainId, moduleAddress, transferData);

    const txHash = await walletClient.writeContract({
      address: moduleAddress,
      abi: MODULE_ABI,
      functionName: 'execute',
      args: [tokenAddress, amount, to, account, signedTransfer.expiry, signedTransfer.signature],
      account: walletClient.account,
      chain: chain.getViemChain(),
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info(`Hub transfer ${amount} of ${tokenAddress} ${account}->${to} tx ${txHash}`, 'HubTransfer');
    return { success: true, txHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Hub transfer failed', 'HubTransfer', error);
    return { success: false, error: message };
  }
}
