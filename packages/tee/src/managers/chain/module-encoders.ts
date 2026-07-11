// Module Data Encoders
// Encode configuration data for different module types
// Uses existing ABIs from config/web3/abis

import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import { logger } from '../log';
import { AUTO_EARN_ABI, AUTO_BRIDGE_ABI } from '../../config/web3/abis';

/**
 * Encode AutoEarn module configuration data
 * Returns keccak256 hash of encoded parameters
 * Uses the setConfig ABI structure from AUTO_EARN_ABI
 * 
 * @param params - AutoEarn configuration parameters
 * @returns Encoded data as Hex (keccak256 hash for module identification)
 */
export function encodeAutoEarnData(params: {
  chainId: number;
  tokenAddress: Address;
  vaultAddress: Address;
}): Hex {
  try {
    // Extract setConfig components from AUTO_EARN_ABI
    const setConfigAbi = AUTO_EARN_ABI.find((item) => item.name === 'setConfig');
    if (!setConfigAbi || !setConfigAbi.inputs?.[0]?.components) {
      throw new Error('setConfig function or components not found in AUTO_EARN_ABI');
    }

    // Use the components from the ABI directly
    const components = setConfigAbi.inputs[0].components;
    const encoded = encodeAbiParameters(
      components as any,
      [
        BigInt(params.chainId),
        params.tokenAddress,
        params.vaultAddress
      ]
    );

    const hash = keccak256(encoded);
    logger.debug('Encoded AutoEarn data', 'ModuleEncoder', { params, hash });
    return hash;
  } catch (error: any) {
    logger.error('Failed to encode AutoEarn data', 'ModuleEncoder', error);
    throw new Error(`Failed to encode AutoEarn data: ${error.message}`);
  }
}

/**
 * Encode AutoSwap module configuration data
 * Returns keccak256 hash of encoded parameters
 * Note: AUTO_SWAP_ABI doesn't have setConfig, but we encode the configuration
 * parameters to generate a unique hash for module identification
 * 
 * @param params - AutoSwap configuration parameters
 * @returns Encoded data as Hex (keccak256 hash for module identification)
 */
export function encodeAutoSwapData(params: {
  chainId: number;
  outputTokenAddress: Address;
  poolFee?: number;
  slippage?: number;
}): Hex {
  try {
    // Encode configuration parameters (chainId, outputToken, poolFee, slippage)
    // to generate a unique configuration hash
    const encoded = encodeAbiParameters(
      [
        { name: 'chainId', type: 'uint256' },
        { name: 'outputToken', type: 'address' },
        { name: 'poolFee', type: 'uint24' },
        { name: 'slippage', type: 'uint256' }
      ],
      [
        BigInt(params.chainId),
        params.outputTokenAddress,
        params.poolFee || 3000, // Default 0.3% pool fee
        BigInt(params.slippage || 10000) // Default 1% slippage (10000 basis points)
      ]
    );

    const hash = keccak256(encoded);
    logger.debug('Encoded AutoSwap data', 'ModuleEncoder', { params, hash });
    return hash;
  } catch (error: any) {
    logger.error('Failed to encode AutoSwap data', 'ModuleEncoder', error);
    throw new Error(`Failed to encode AutoSwap data: ${error.message}`);
  }
}

/**
 * Encode AutoBridge module configuration data
 * Returns keccak256 hash of encoded parameters
 * Uses the setConfig ABI structure from AUTO_BRIDGE_ABI
 * 
 * @param params - AutoBridge configuration parameters
 * @returns Encoded data as Hex (keccak256 hash for module identification)
 */
export function encodeAutoBridgeData(params: {
  sourceChainId: number;
  sourceTokenAddress: Address;
  destinationChainId: number;
}): Hex {
  // AutoBridge module expects a config hash, not raw parameters
  // Encode as tuple[] first, then hash it (matching working script pattern)
  const bridgeConfigData = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'sourceChainId', type: 'uint256' },
          { name: 'sourceTokenAddress', type: 'address' },
          { name: 'destinationChainId', type: 'uint256' },
        ],
      },
    ],
    [
      [
        {
          sourceChainId: BigInt(params.sourceChainId),
          sourceTokenAddress: params.sourceTokenAddress,
          destinationChainId: BigInt(params.destinationChainId),
        },
      ],
    ]
  );

  // Return the config hash as expected by the module
  return keccak256(bridgeConfigData);
}

