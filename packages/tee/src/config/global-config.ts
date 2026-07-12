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
 * Private-route (/private-route) configuration.
 * The privacy hub chain is where funds are shielded/unshielded via Railgun.
 */
export const PRIVACY_HUB_CHAIN_ID = Number(process.env.PRIVACY_HUB_CHAIN_ID) || 42161; // Arbitrum One
export const PRIVATE_ROUTE_MONITOR_INTERVAL_MS = Number(process.env.PRIVATE_ROUTE_MONITOR_INTERVAL_MS) || 15000;
export const PRIVATE_ROUTE_MONITOR_ENABLED = process.env.PRIVATE_ROUTE_MONITOR_ENABLED !== 'false';

/**
 * The route fee is the spread between what the user sends and the output we
 * GUARANTEE to deliver: fee = max(min-USD floor, bps of amount). It's not a
 * separate skim — it's the buffer that covers the actual costs (Railgun's 0.5%
 * shield+unshield, Relay's two bridge legs, gas) plus our margin. We quote the
 * output up front, store what the user confirmed, and must deliver it.
 */
export const PRIVATE_ROUTE_FEE_BPS = Number(process.env.PRIVATE_ROUTE_FEE_BPS) || 150; // 1.50%
export const PRIVATE_ROUTE_FEE_MIN_USD = Number(process.env.PRIVATE_ROUTE_FEE_MIN_USD) || 1;

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
 * are transmitted in the request so the server can reconstruct exactly what
 * was signed. eoaAddress is lower-cased to avoid checksum-casing mismatches
 * between signing and verification.
 *
 * Every security-relevant field is included so the signature binds them: not
 * just identity (ensUsername, eoaAddress, expiration) but also the stealth and
 * zcash key material (spendingPublicKey, viewingPrivateKey, zcashAddress).
 * Otherwise a tampering client/proxy could keep a valid signature while
 * swapping in attacker-controlled keys, hijacking where funds are routed.
 */
export function buildRegistrationMessage(params: {
  ensUsername: string;
  eoaAddress: string;
  expiration: number;
  spendingPublicKey: string;
  viewingPrivateKey: string;
  zcashAddress: string;
}): string {
  return JSON.stringify({
    ensUsername: params.ensUsername,
    eoaAddress: params.eoaAddress.toLowerCase(),
    expiration: params.expiration,
    spendingPublicKey: params.spendingPublicKey,
    viewingPrivateKey: params.viewingPrivateKey,
    zcashAddress: params.zcashAddress,
  });
}

