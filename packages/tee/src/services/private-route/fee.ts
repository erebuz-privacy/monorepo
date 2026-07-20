// Service-fee computation: max(min-USD floor, bps of amount), in the token's
// smallest units. Applied to the OUTPUT (destination token) — pass the gross
// output amount and its USD value. The USD floor uses Relay's own USD valuation
// so it works for any token (not just stablecoins).

import { PRIVATE_ROUTE_FEE_BPS, PRIVATE_ROUTE_FEE_MIN_USD } from '../../config/global-config';

const USD_SCALE = 1_000_000; // 6-dp fixed point for the USD floats

/**
 * @param amount      amount in the token's smallest units (the output amount)
 * @param amountInUsd USD value of `amount` (from the Relay quote); null => bps only
 */
export function computeServiceFee(amount: bigint, amountInUsd: number | null): bigint {
  const pct = (amount * BigInt(PRIVATE_ROUTE_FEE_BPS)) / 10_000n;
  if (!amountInUsd || amountInUsd <= 0) return pct; // no price -> percentage only

  // floor (token units) = amount * (minUsd / amountInUsd)
  const minUsdScaled = BigInt(Math.round(PRIVATE_ROUTE_FEE_MIN_USD * USD_SCALE));
  const usdScaled = BigInt(Math.round(amountInUsd * USD_SCALE));
  const floor = usdScaled > 0n ? (amount * minUsdScaled) / usdScaled : pct;

  return pct > floor ? pct : floor;
}

// Protocol fees on the CCTP privacy route, BEYOND our service fee. They come out
// of the user's output, so the quote must subtract them or we'd over-promise the
// delivered amount (the recipient would receive less than shown).
//
//  - Railgun charges 0.25% when unshielding from the shielded pool.
//  - CCTP fast-transfer charges a small fee on the destination-facing burn.
//
// The leg-1 CCTP fee + Railgun shield fee are absorbed by our service margin (they
// reduce the surplus we keep in the pool), so they don't reduce the user's output.
export const RAILGUN_UNSHIELD_FEE_BPS = 25n; // 0.25%
export const CCTP_BRIDGE_FEE_BPS = 3n; // ~0.03% (conservative vs ~0.013% observed on the dest leg)

export interface CctpRouteFees {
  /** Our fee (margin), realized as the surplus left in the shielded pool. */
  serviceFee: bigint;
  /** Railgun unshield fee (0.25% of the unshielded gross). */
  privacyFee: bigint;
  /** CCTP fast-transfer fee on the destination burn. */
  bridgeFee: bigint;
  /** Amount unshielded from the pool (gross = amount − serviceFee). */
  unshieldAmount: bigint;
  /** Net delivered to the recipient = what we promise. delivered ≥ this by design. */
  quotedOutput: bigint;
}

/**
 * Break an input `amount` (USDC smallest units) into the CCTP-route fee components
 * and the guaranteed net output. The state machine unshields `unshieldAmount`
 * (amount − serviceFee) and burns the result to the recipient, so the recipient
 * receives `unshieldAmount − railgunFee − cctpFee`, which this returns as
 * `quotedOutput`. Using a conservative CCTP fee estimate keeps delivered ≥ quoted.
 */
export function computeCctpRouteFees(amount: bigint, amountInUsd: number | null): CctpRouteFees {
  const serviceFee = computeServiceFee(amount, amountInUsd);
  if (serviceFee >= amount) throw new Error('Amount too small: fee would exceed the output');
  const unshieldAmount = amount - serviceFee;
  const privacyFee = (unshieldAmount * RAILGUN_UNSHIELD_FEE_BPS) / 10_000n;
  const afterUnshield = unshieldAmount - privacyFee;
  const bridgeFee = (afterUnshield * CCTP_BRIDGE_FEE_BPS) / 10_000n;
  const quotedOutput = afterUnshield - bridgeFee;
  if (quotedOutput <= 0n) throw new Error('Amount too small for this route');
  return { serviceFee, privacyFee, bridgeFee, unshieldAmount, quotedOutput };
}
