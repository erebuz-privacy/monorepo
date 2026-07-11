// Stealth Address Utility Functions

import {
  generateEphemeralPrivateKey,
  extractViewingPrivateKeyNode,
  generateStealthAddresses,
} from '@fluidkey/stealth-account-kit';
import type { Hex } from 'viem';
import { StealthError } from './errors';

/**
 * Parameters for generating stealth addresses
 */
export interface StealthAddressGenerationParams {
  viewingPrivateKey: Hex;
  spendingPublicKey: Hex;
  startNonce: number;
  accountAmount: number;
  chainId: number | bigint;
}

/**
 * Result of stealth address generation
 */
export interface StealthAddressGenerationResult {
  addresses: Array<{
    address: Hex;
    nonce: number;
  }>;
  totalGenerated: number;
  chainId: number;
  startNonce: string;
  endNonce: string;
}

/**
 * Error class for stealth address generation failures
 */
export class StealthGenerationError extends StealthError {
  constructor(message: string, context?: { error?: unknown }) {
    super(message, 'GENERATION_FAILED', context);
    this.name = 'StealthGenerationError';
    Object.setPrototypeOf(this, StealthGenerationError.prototype);
  }
}

/**
 * Compute stealth addresses using Fluid Key SDK
 * @param params - Parameters for stealth address generation
 * @returns Promise resolving to stealth address generation result
 */
export async function computeStealthAddresses(
  params: StealthAddressGenerationParams
): Promise<StealthAddressGenerationResult> {
  try {
    const { viewingPrivateKey, spendingPublicKey, startNonce, accountAmount, chainId } = params;

    const addresses: Array<{ address: Hex; nonce: number }> = [];
    const startNonceBigInt = BigInt(startNonce);
    const accountAmountBigInt = BigInt(accountAmount);
    const endNonce = startNonceBigInt + accountAmountBigInt;

    for (let nonce = startNonceBigInt; nonce < endNonce; nonce++) {
      try {
        // Extract the viewing key node
        const privateViewingKeyNode = extractViewingPrivateKeyNode(viewingPrivateKey, 0);

        // Generate ephemeral private key
        const ephemeralResult = generateEphemeralPrivateKey({
          viewingPrivateKeyNode: privateViewingKeyNode,
          nonce,
          chainId: Number(chainId),
        });

        // Handle different return formats from Fluid Key SDK
        const ephemeralPrivateKeyRaw = ephemeralResult.ephemeralPrivateKey || ephemeralResult;

        // Convert to proper format
        let ephemeralPrivateKeyHex: string;
        if (typeof ephemeralPrivateKeyRaw === 'string') {
          ephemeralPrivateKeyHex = ephemeralPrivateKeyRaw.replace('0x', '');
        } else {
          ephemeralPrivateKeyHex = Array.from(ephemeralPrivateKeyRaw as Uint8Array)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        }

        const formattedEphemeralPrivateKey = `0x${ephemeralPrivateKeyHex}` as Hex;

        // Generate stealth addresses
        const result = generateStealthAddresses({
          spendingPublicKeys: [spendingPublicKey],
          ephemeralPrivateKey: formattedEphemeralPrivateKey,
        });

        if (result.stealthAddresses && result.stealthAddresses.length > 0) {
          const stealthAddress = result.stealthAddresses[0];
          if (stealthAddress) {
            addresses.push({
              address: stealthAddress,
              nonce: Number(nonce),
            });
          }
        }
      } catch (error) {
        console.error('Error generating stealth address for nonce', nonce, error);
        continue;
      }
    }

    return {
      addresses,
      totalGenerated: addresses.length,
      chainId: Number(chainId),
      startNonce: startNonceBigInt.toString(),
      endNonce: (endNonce - 1n).toString(),
    };
  } catch (error) {
    throw new StealthGenerationError('Failed to compute stealth addresses', { error });
  }
}

