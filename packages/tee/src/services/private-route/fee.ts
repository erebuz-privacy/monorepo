// Service-fee computation: max(min-USD floor, bps of amount), in the token's
// smallest units. The USD floor uses Relay's own USD valuation so it works for
// any token (not just stablecoins).

import { PRIVATE_ROUTE_FEE_BPS, PRIVATE_ROUTE_FEE_MIN_USD } from '../../config/global-config';

const USD_SCALE = 1_000_000; // 6-dp fixed point for the USD floats

/**
 * @param amount      input amount in the token's smallest units
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
