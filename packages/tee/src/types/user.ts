// User Service Types

import type { Hex } from 'viem';

// Re-export Hex for backward compatibility
export type { Hex } from 'viem';

/**
 * ENS data for registration
 */
export interface EnsData {
  ensUsername: string;
  eoaAddress: string;
  addresses?: Record<string, string>;
  texts?: Record<string, string>;
  contenthash?: string;
}

/**
 * Common data for registration
 * Privacy is always enabled - all users use stealth addresses
 */
export interface CommonData {
  ensData: EnsData;
  spendingPublicKey: Hex; // Required - stealth address spending public key
  viewingPrivateKey: Hex; // Required - stealth address viewing private key
  zcashAddress: string; // Required - Zcash transparent address (t1... or t3...) for receiving funds
}

/**
 * Register request
 */
export interface RegisterRequest extends CommonData {
  // this is a signature for the common data
  signature: {
    signature: Hex;
    expiration: number;
  };
}

/**
 * Register response
 */
export interface RegisterResponse {
  success: boolean;
  ensUsername: string;
}

