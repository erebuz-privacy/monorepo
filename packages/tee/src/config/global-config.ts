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
 *
 * Router model: every route funnels through the Railgun pool on Arbitrum. Relay
 * bridges the source (any supported chain) into USDC on Arbitrum, Railgun
 * shields/unshields there (the privacy break), then Relay bridges out to the
 * destination (any supported chain). So Arbitrum's Railgun pool is the single
 * routing hub for all Relay chains; only the in/out legs vary.
 */
export const PRIVACY_HUB_CHAIN_ID = Number(process.env.PRIVACY_HUB_CHAIN_ID) || 42161; // Arbitrum One
// Canonical token shielded on the hub. Relay swaps any source token into this on
// the way in and out of it on the way out, so the source/destination tokens are
// NOT required to exist on the hub chain — only this one must (USDC on Arbitrum
// is the most liquid + Railgun-supported).
export const PRIVACY_HUB_TOKEN_SYMBOL = process.env.PRIVACY_HUB_TOKEN_SYMBOL || 'USDC';
export const PRIVATE_ROUTE_MONITOR_INTERVAL_MS = Number(process.env.PRIVATE_ROUTE_MONITOR_INTERVAL_MS) || 15000;
export const PRIVATE_ROUTE_MONITOR_ENABLED = process.env.PRIVATE_ROUTE_MONITOR_ENABLED !== 'false';

// Bridge provider for the in/out legs. 'cctp' = Circle CCTP (native USDC burn/mint,
// no slippage/liquidity caps); 'relay' = Relay (any token, liquidity-based). CCTP
// bridges USDC only; a swap provider handles USDC<->other-token conversion.
export const BRIDGE_PROVIDER = (process.env.BRIDGE_PROVIDER || 'relay').toLowerCase();

/**
 * Privacy implementation selected for new routes when the API caller does not
 * choose one explicitly. Railgun remains the backwards-compatible default;
 * `arc` routes through Erebuz's PrivacyPoolComplex deployment on Arc Testnet.
 */
export type PrivacyProvider = 'railgun' | 'arc' | 'strk20';
const PRIVACY_PROVIDERS: PrivacyProvider[] = ['railgun', 'arc', 'strk20'];
export function isPrivacyProvider(value: unknown): value is PrivacyProvider {
  return typeof value === 'string' && (PRIVACY_PROVIDERS as string[]).includes(value);
}
export const DEFAULT_PRIVACY_PROVIDER: PrivacyProvider = (() => {
  const raw = process.env.DEFAULT_PRIVACY_PROVIDER?.toLowerCase();
  return isPrivacyProvider(raw) ? raw : 'railgun';
})();
export const ARC_PRIVACY_HUB_CHAIN_ID = 5_042_002;
/**
 * STRK20 (StarkWare's Starknet privacy pool) routes hub on Starknet: source
 * chain -> CCTP -> Starknet hub account -> STRK20 pool -> CCTP -> destination.
 * Both CCTP legs are validated by scripts/test-cctp-starknet.ts; the pool hop
 * needs STRK20_PROVING_SERVICE_URL + STRK20_INDEXER_URL to be configured.
 */
export const STRK20_PRIVACY_HUB_CHAIN_ID = 23_448_594; // Starknet Sepolia (synthetic id)
export const STRK20_POOL_ADDRESS =
  process.env.STRK20_POOL_ADDRESS || '0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91';
/** The privacy leg is only live once BOTH services are configured. */
export function strk20PoolConfigured(): boolean {
  return Boolean(process.env.STRK20_PROVING_SERVICE_URL && process.env.STRK20_INDEXER_URL);
}

/**
 * DEMO ONLY. Routes USDC through Starknet over pure CCTP with NO privacy hop, so a
 * Base -> Starknet -> destination transfer completes end to end while StarkWare's
 * proving service stays unavailable.
 *
 * This is NOT a private route. It exists because a STRK20 pool deposit needs a
 * STARK proof, proofs come from a proving service StarkWare does not publish, and
 * there is no self-hostable prover in the open-source SDK. Without this flag such
 * a route correctly parks funds on the hub and waits.
 *
 * Every surface that can express it MUST say so: the quote carries
 * `transportOnly: true` and the route trail is labelled. Never enable it on a
 * deployment that presents these as private transfers.
 */
export const STRK20_TRANSPORT_ONLY = process.env.STRK20_TRANSPORT_ONLY === 'true';

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
