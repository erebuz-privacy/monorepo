// Smart Account Computation Utility
// Simplified computation for ENS resolution with NearIntentBridgeModule
// Matches deployment script approach: uses InstallConfig with EIP-712 signature

import type { Address, Hex } from 'viem';
import { encodeAbiParameters, encodeFunctionData, bytesToHex, toBytes, getAddress, keccak256 } from 'viem';
import { chainManager } from '../managers/chain';
import { logger } from '../managers/log';
import { NEXUS_ACCOUNT_FACTORY_ABI } from '../config/web3/abis';
import { NEAR_INTENT_BRIDGE_MODULE } from '../config/global-config';
import { bootstrapInitNexusAbi } from '../scripts/abis';
import { getEIP712Signer, createInstallConfigData, encodeInstallData } from '../services/eip712-signer';

export interface SmartAccountResult {
  success: boolean;
  address?: Address;
  initData?: Hex; // Return initData used for computation
  installConfig?: {
    tokens: Address[];
    maxAmounts: bigint[];
    expiry: bigint;
    startTime: bigint;
    nonce: bigint;
  }; // Return InstallConfig data for storage
  error?: string;
}

/**
 * Compute smart account address for ENS resolution
 * Matches deployment script approach:
 * - Uses stealth address as owner
 * - Creates and signs InstallConfig (tokens, maxAmounts, expiry, startTime, nonce)
 * - Uses stealth address (bytes20) converted to uint256 as nonce for InstallConfig
 * - Encodes signed InstallConfig in executor data
 * - Uses initNexusWithDefaultValidatorAndOtherModulesNoRegistry (no registry)
 * - Uses keccak256(stealthAddress) as salt (not constant)
 *
 * @param stealthAddress - The stealth address to use as owner (also used as nonce)
 * @param chainId - Target chain ID
 * @param tokens - Optional token addresses (defaults to USDC from chain config if available)
 * @param maxAmounts - Optional max amounts per token (defaults to 10,000 USDC if tokens provided)
 * @returns Smart account address, initData, and InstallConfig
 */
export async function computeSmartAccountForENS(
  stealthAddress: Address,
  chainId: number,
  tokens?: Address[],
  maxAmounts?: bigint[]
): Promise<SmartAccountResult> {
  try {
    // Convert stealth address (bytes20) to uint256 for use as nonce
    const stealthAddressBigInt = BigInt(stealthAddress);
    
    logger.info(`Computing smart account for ENS resolution`, 'SmartAccount', {
      stealthAddress,
      chainId,
      nonce: stealthAddressBigInt.toString(),
    });

    // Get chain
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return {
        success: false,
        error: `Unsupported chain ID: ${chainId}`,
      };
    }

    // Get public client
    const publicClient = chain.getPublicClient();
    if (!publicClient) {
      return {
        success: false,
        error: `No public client available for chain ${chainId}`,
      };
    }

    // Get required contracts
    const nexusAccountFactory = chain.getNexusAccountFactory();
    const nexusBootstrap = chain.getNexusBootstrap();

    if (!nexusAccountFactory || !nexusBootstrap) {
      return {
        success: false,
        error: 'Required contracts not found (NexusAccountFactory or NexusBootstrap)',
      };
    }

    // Get NearIntentBridgeModule address for this chain
    const moduleAddress = NEAR_INTENT_BRIDGE_MODULE[chainId];
    if (!moduleAddress || moduleAddress === '0x0000000000000000000000000000000000000000') {
      logger.warn(`NearIntentBridgeModule not configured for chain ${chainId}`, 'SmartAccount');
      // Fall back to just the stealth address if module not configured
      return {
        success: true,
        address: stealthAddress,
      };
    }

    // Prepare bootstrap configuration
    // Owner: stealth address (encoded as bytes for defaultValidatorInitData)
    const defaultValidatorInitData = bytesToHex(toBytes(getAddress(stealthAddress)));

    // No additional validators
    const validators: Array<{ module: Address; data: Hex }> = [];

    // Prepare InstallConfig data (matching deployment script)
    // Default: always include USDC, USDT, and WETH if available in chain config
    let installTokens: Address[] = tokens || [];
    let installMaxAmounts: bigint[] = maxAmounts || [];

    // If tokens not provided, get USDC, USDT, and WETH from chain config
    if (installTokens.length === 0) {
      try {
        // Chain class has tokens property directly accessible
        const chainTokens = (chain as any).tokens;
        if (chainTokens && Array.isArray(chainTokens)) {
          const tokenSymbols = ['USDC', 'USDT', 'WETH'];
          
          for (const symbol of tokenSymbols) {
            const token = chainTokens.find((t: any) => t.symbol === symbol);
            if (token?.address) {
              installTokens.push(token.address as Address);
              
              // Set max amounts based on token type and decimals
              const decimals = token.decimals || (symbol === 'WETH' ? 18 : symbol === 'USDC' ? 6 : 6);
              let maxAmount: bigint;
              
              if (symbol === 'WETH') {
                maxAmount = 10n * 10n ** BigInt(decimals); // 10 WETH
              } else {
                // USDC/USDT: 10,000 tokens
                maxAmount = 10000n * 10n ** BigInt(decimals);
              }
              
              installMaxAmounts.push(maxAmount);
            }
          }
          
          logger.info(`Loaded tokens from chain config: ${installTokens.length} tokens`, 'SmartAccount', {
            tokens: installTokens,
            symbols: tokenSymbols.filter((sym) => 
              chainTokens.find((t: any) => t.symbol === sym)
            ),
          });
        }
      } catch (e) {
        logger.warn(`Could not load chain config for tokens, using empty arrays`, 'SmartAccount', e);
      }
    }

    // Create InstallConfig data
    // Use stealth address (bytes20 -> uint256) as nonce
    const validityDuration = 365 * 24 * 60 * 60; // 1 year
    const installConfigData = createInstallConfigData(
      installTokens,
      installMaxAmounts,
      validityDuration,
      stealthAddressBigInt
    );

    // Sign InstallConfig using TEE signer
    const teeSigner = getEIP712Signer();
    const signedConfig = await teeSigner.signInstallConfig(
      chainId,
      moduleAddress,
      installConfigData
    );

    // Encode executor data (matching deployment script)
    const executorData = encodeInstallData(signedConfig);

    const executors = [
      {
        module: moduleAddress,
        data: executorData, // Full InstallConfig encoded in executor data
      },
    ];

    // No hook
    const hook = {
      module: '0x0000000000000000000000000000000000000000' as Address,
      data: '0x' as Hex,
    };

    // No fallbacks
    const fallbacks: Array<{ module: Address; data: Hex }> = [];

    // No pre-validation hooks
    const preValidationHooks: Array<{ hookType: bigint; module: Address; data: Hex }> = [];

    // Encode the bootstrap init call (NO REGISTRY - matching deployment script)
    const initNexusData = encodeFunctionData({
      abi: bootstrapInitNexusAbi,
      functionName: 'initNexusWithDefaultValidatorAndOtherModulesNoRegistry',
      args: [defaultValidatorInitData, validators, executors, hook, fallbacks, preValidationHooks],
    });

    // Create full initialization data: (bootstrapAddress, initNexusData)
    const initData = encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }],
      [nexusBootstrap.address as Address, initNexusData]
    );

    // Use keccak256(stealthAddress) as salt (matching deployment script)
    const salt = keccak256(toBytes(getAddress(stealthAddress)));

    logger.debug(`Smart account computation params`, 'SmartAccount', {
      owner: stealthAddress,
      module: moduleAddress,
      salt: salt,
      factory: nexusAccountFactory.address,
      nonce: stealthAddressBigInt.toString(),
      tokens: installTokens.length,
    });

    // Compute the smart account address
    const smartAccountAddress = await publicClient.readContract({
      address: nexusAccountFactory.address as Address,
      abi: NEXUS_ACCOUNT_FACTORY_ABI,
      functionName: 'computeAccountAddress',
      args: [initData, salt],
    });

    logger.info(`Computed smart account: ${smartAccountAddress}`, 'SmartAccount', {
      stealthAddress,
      chainId,
      nonce: stealthAddressBigInt.toString(),
      salt,
    });

    return {
      success: true,
      address: smartAccountAddress as Address,
      initData: initData,
      installConfig: {
        tokens: installConfigData.tokens,
        maxAmounts: installConfigData.maxAmounts,
        expiry: installConfigData.expiry,
        startTime: installConfigData.startTime,
        nonce: installConfigData.nonce,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error computing smart account: ${errorMessage}`, 'SmartAccount', error);

    // Fall back to stealth address on error
    return {
      success: true,
      address: stealthAddress,
    };
  }
}
