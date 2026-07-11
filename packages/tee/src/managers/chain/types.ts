// Chain Manager Type Definitions

import type { Address } from 'viem';

/**
 * Smart account module structure for computation
 */
export interface SmartAccountModule {
  address: Address;
  data: `0x${string}`;
  chainId: number;
}

/**
 * Smart account computation result
 */
export interface SmartAccountComputationResult {
  success: boolean;
  smartAccountAddress?: Address;
  error?: string;
  computationDetails?: {
    owner: Address;
    modules: SmartAccountModule[];
    chainId: number;
    salt: string;
    initData: string;
  };
}

