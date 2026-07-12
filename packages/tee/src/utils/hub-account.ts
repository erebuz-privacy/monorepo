// TEE-owned hub smart account derivation
//
// Derives a per-route Biconomy Nexus smart account on the privacy-hub chain
// (Arbitrum) whose owner is the TEE signer. This is the address Relay's leg-1
// delivers to. It mirrors computeSmartAccountForENS (src/utils/smart-account.ts)
// but (a) uses the TEE signer as the account owner and (b) derives salt/nonce
// from the routeId so each route gets a unique account.
//
// NOTE: like computeSmartAccountForENS, a functional account requires our
// transfer module to be configured for the chain (NEAR_INTENT_BRIDGE_*). Until
// that module is deployed with our teeSigner and set in the env, this falls
// back to returning the TEE signer EOA as the hub account (funds still route,
// just without a dedicated per-route smart account).

import type { Address, Hex } from 'viem';
import {
  encodeAbiParameters,
  encodeFunctionData,
  bytesToHex,
  toBytes,
  getAddress,
  keccak256,
  toHex,
} from 'viem';
import { chainManager } from '../managers/chain';
import { logger } from '../managers/log';
import { NEXUS_ACCOUNT_FACTORY_ABI } from '../config/web3/abis';
import { NEAR_INTENT_BRIDGE_MODULE } from '../config/global-config';
import { bootstrapInitNexusAbi } from '../scripts/abis';
import { getEIP712Signer, createInstallConfigData, encodeInstallData } from '../services/eip712-signer';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface HubAccountResult {
  success: boolean;
  /** The hub account address (TEE-owned SA, or TEE EOA fallback). */
  address: Address;
  /** True when a real per-route smart account was derived (module configured). */
  isSmartAccount: boolean;
  /** initData used for the counterfactual account (null in EOA fallback). */
  initData?: Hex;
  /** CREATE2 salt used (null in EOA fallback). */
  salt?: Hex;
  error?: string;
}

/**
 * Derive the TEE-owned hub smart account for a route on `chainId`.
 * `routeId` makes the account unique per route.
 */
export async function computeTeeOwnedHubAccount(
  chainId: number,
  routeId: string
): Promise<HubAccountResult> {
  const teeOwner = getEIP712Signer().getAddress();

  try {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return { success: false, address: teeOwner, isSmartAccount: false, error: `Unsupported chain ${chainId}` };
    }

    const moduleAddress = NEAR_INTENT_BRIDGE_MODULE[chainId];
    if (!moduleAddress || moduleAddress === ZERO_ADDRESS) {
      logger.warn(
        `No transfer module configured for chain ${chainId}; hub account falls back to TEE EOA ${teeOwner}. ` +
          `Deploy the module and set NEAR_INTENT_BRIDGE_* to enable per-route smart accounts.`,
        'HubAccount'
      );
      return { success: true, address: teeOwner, isSmartAccount: false };
    }

    const publicClient = chain.getPublicClient();
    const nexusAccountFactory = chain.getNexusAccountFactory();
    const nexusBootstrap = chain.getNexusBootstrap();
    if (!publicClient || !nexusAccountFactory || !nexusBootstrap) {
      return {
        success: false,
        address: teeOwner,
        isSmartAccount: false,
        error: 'Missing publicClient / NexusAccountFactory / NexusBootstrap',
      };
    }

    // Per-route seed → salt and InstallConfig nonce (deterministic, unique per route).
    const seed = keccak256(toHex(`hub:${getAddress(teeOwner)}:${routeId}`));
    const salt: Hex = seed;
    const configNonce = BigInt(seed);

    // Owner (TEE) is the default validator init data.
    const defaultValidatorInitData = bytesToHex(toBytes(getAddress(teeOwner)));
    const validators: Array<{ module: Address; data: Hex }> = [];

    // Default token allowlist from the chain config (USDC/USDT/WETH), mirroring computeSmartAccountForENS.
    const installTokens: Address[] = [];
    const installMaxAmounts: bigint[] = [];
    const chainTokens = (chain as unknown as { tokens?: Array<{ symbol: string; address: string; decimals?: number }> }).tokens;
    if (Array.isArray(chainTokens)) {
      for (const symbol of ['USDC', 'USDT', 'WETH']) {
        const token = chainTokens.find((t) => t.symbol === symbol);
        if (token?.address) {
          installTokens.push(token.address as Address);
          const decimals = token.decimals || (symbol === 'WETH' ? 18 : 6);
          installMaxAmounts.push(
            symbol === 'WETH' ? 10n * 10n ** BigInt(decimals) : 10000n * 10n ** BigInt(decimals)
          );
        }
      }
    }

    const validityDuration = 365 * 24 * 60 * 60; // 1 year
    const installConfigData = createInstallConfigData(
      installTokens,
      installMaxAmounts,
      validityDuration,
      configNonce
    );

    const teeSigner = getEIP712Signer();
    const signedConfig = await teeSigner.signInstallConfig(chainId, moduleAddress, installConfigData);
    const executorData = encodeInstallData(signedConfig);

    const executors = [{ module: moduleAddress, data: executorData }];
    const hook = { module: ZERO_ADDRESS as Address, data: '0x' as Hex };
    const fallbacks: Array<{ module: Address; data: Hex }> = [];
    const preValidationHooks: Array<{ hookType: bigint; module: Address; data: Hex }> = [];

    const initNexusData = encodeFunctionData({
      abi: bootstrapInitNexusAbi,
      functionName: 'initNexusWithDefaultValidatorAndOtherModulesNoRegistry',
      args: [defaultValidatorInitData, validators, executors, hook, fallbacks, preValidationHooks],
    });

    const initData = encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }],
      [nexusBootstrap.address as Address, initNexusData]
    );

    const address = (await publicClient.readContract({
      address: nexusAccountFactory.address as Address,
      abi: NEXUS_ACCOUNT_FACTORY_ABI,
      functionName: 'computeAccountAddress',
      args: [initData, salt],
    })) as Address;

    logger.info(`Derived TEE-owned hub account ${address} on chain ${chainId} (route ${routeId})`, 'HubAccount');
    return { success: true, address, isSmartAccount: true, initData, salt };
  } catch (error) {
    logger.error('Failed to derive hub account; falling back to TEE EOA', 'HubAccount', error);
    return {
      success: true,
      address: teeOwner,
      isSmartAccount: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
