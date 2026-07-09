// Global Configuration

import type { Address, Hex } from 'viem';

/**
 * Message used for stealth address generation and signature verification
 */
export const STEALTH_ADDRESS_GENERATION_MESSAGE = 'i_want_to_view_my_balance';

/**
 * Default batch size for operations
 */
export const DEFAULT_BATCH_SIZE = 1;

/**
 * Maximum nonce value per chain
 */
export const MAX_NONCE_PER_CHAIN = 1000000;

/**
 * Default chain ID (Ethereum Mainnet)
 */
export const DEFAULT_CHAIN_ID = 1;

/**
 * Constant salt for smart account computation
 * This ensures deterministic addresses across all users
 */
export const SMART_ACCOUNT_SALT: Hex = '0x0000000000000000000000000000000000000000000000000000000000000001';

/**
 * NearIntentBridgeModule (AutoShield) addresses per chain
 * This module is always installed as executor for ENS resolution
 */
export const NEAR_INTENT_BRIDGE_MODULE: Record<number, Address> = {
  // Mainnets
  8453: process.env.NEAR_INTENT_BRIDGE_BASE as Address || '0x0000000000000000000000000000000000000000' as Address,
  137: process.env.NEAR_INTENT_BRIDGE_POLYGON as Address || '0x0000000000000000000000000000000000000000' as Address,
  42161: process.env.NEAR_INTENT_BRIDGE_ARBITRUM as Address || '0x0000000000000000000000000000000000000000' as Address,
  10: process.env.NEAR_INTENT_BRIDGE_OPTIMISM as Address || '0x0000000000000000000000000000000000000000' as Address,
};

/**
 * Deposit monitor configuration
 */
export const DEPOSIT_MONITOR_INTERVAL_MS = Number(process.env.DEPOSIT_MONITOR_INTERVAL_MS) || 60000; // 1 minute default
export const DEPOSIT_MONITOR_ENABLED = process.env.DEPOSIT_MONITOR_ENABLED !== 'false';

/**
 * ENS domain configuration
 * All ENS names must be subdomains under this domain
 */
export const ENS_DOMAIN = 'assuranet.eth';

/**
 * Build the canonical registration message that the user's EOA must sign.
 *
 * SECURITY: The client (scripts/register-user.ts) and the server
 * (UserService.registerUser) MUST construct this string identically so the
 * signature can be verified server-side. It is derived only from fields that
 * are transmitted in the request (ensUsername, eoaAddress, expiration) so the
 * server can reconstruct exactly what was signed. eoaAddress is lower-cased to
 * avoid checksum-casing mismatches between signing and verification.
 */
export function buildRegistrationMessage(params: {
  ensUsername: string;
  eoaAddress: string;
  expiration: number;
}): string {
  return JSON.stringify({
    ensUsername: params.ensUsername,
    eoaAddress: params.eoaAddress.toLowerCase(),
    expiration: params.expiration,
  });
}

