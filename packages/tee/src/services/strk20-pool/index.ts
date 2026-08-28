// STRK20 (StarkWare Starknet privacy pool) adapter — the privacy hop for
// `privacyProvider: 'strk20'` routes.
//
// Route shape (Starknet is the HUB, never the user-facing source or destination):
//   source EVM chain -> CCTP -> Starknet hub account -> STRK20 pool (private note)
//     -> pool withdraw -> CCTP -> destination EVM chain
//
// STATUS. The two CCTP legs are real and validated end to end on testnet by
// `pnpm --filter @erebuz/tee test:cctp:starknet`. The POOL HOP below is not yet
// implemented, because it needs two things we do not have:
//
//   1. A proving service URL and a discovery/indexer URL. StarkWare does not
//      publish these; every example takes them from env, and the reference
//      demo's mainnet config ships them as literal TODO placeholders. They must
//      come from StarkWare (or be self-hosted from crates/discovery-service).
//   2. `@starkware-libs/starknet-privacy-sdk`, which requires Node >= 24 (this
//      package runs on 20 in Docker) and resolves from GitHub Packages rather
//      than npmjs, so it needs a token even though it is public.
//
// FAIL CLOSED. Until both land, a strk20 route must PAUSE at the pool hop, never
// skip it. Skipping would bridge the funds Base -> Starknet -> destination with
// no privacy break at all while still reporting a "private" route — delivering
// the money but silently voiding the only property the product sells. The state
// machine treats the error below as a recoverable pause, so an in-flight route
// resumes automatically once the config appears.
//
// When wiring the real thing, the shape is (see strk20-by-example.org/sdk):
//   const transfers = createPrivateTransfers({ account, viewingKeyProvider,
//     provingProvider: { url, chainId }, discoveryProvider: { url }, poolContractAddress })
//   // deposit is TWO transactions: the pool's apply_actions is reentrancy-guarded
//   await account.execute({ contractAddress: usdc, entrypoint: 'approve', ... })
//   await transfers.build({ autoRegister: true, autoSetup: true })
//     .with(usdc, (t) => t.deposit({ amount })).surplusTo(hub).execute({ provingBlockId })
//   // ...wait 10 blocks for note maturity, then:
//   await transfers.build().surplusTo(hub)
//     .with(usdc, (t) => t.inputs(note).withdraw({ amount, recipient: hub }))
//     .execute({ provingBlockId })   // provingBlockId = currentBlock - 10
//
// Two protocol rules that will bite whoever implements it: notes mature 10 blocks
// after creation (spending earlier builds a proof against a state where the note
// is not yet spendable), and every deposit is screened onchain by FPI, which
// signs it — a self-hosted prover does not bypass that.

import { logger } from '../../managers/log';
import { STRK20_POOL_ADDRESS, strk20PoolConfigured } from '../../config/global-config';
import { starknetSignerReady } from '../cctp/starknet';
import type { PrivateRoute } from '../../database/models/private-route';

/** Everything the privacy leg needs before it can run. */
export function strk20PoolReady(): boolean {
  return strk20PoolConfigured() && starknetSignerReady();
}

/** Why the leg is unavailable, for logs and the paused-route reason. */
export function strk20PoolBlockedReason(): string | null {
  if (!starknetSignerReady()) {
    return 'STARKNET_ACCOUNT_ADDRESS + STARKNET_PRIVATE_KEY are not set';
  }
  if (!process.env.STRK20_PROVING_SERVICE_URL) return 'STRK20_PROVING_SERVICE_URL is not set';
  if (!process.env.STRK20_INDEXER_URL) return 'STRK20_INDEXER_URL is not set';
  return null;
}

class Strk20NotConfiguredError extends Error {
  constructor(reason: string) {
    super(
      `STRK20 privacy leg unavailable (${reason}). The route is paused, not bypassed: ` +
        `completing it without the pool hop would deliver the funds with no privacy break.`
    );
    this.name = 'Strk20NotConfiguredError';
  }
}

/** True for the pause-and-retry error, so the state machine never marks FAILED for it. */
export function isStrk20NotConfigured(error: unknown): boolean {
  return error instanceof Strk20NotConfiguredError;
}

function assertReady(): void {
  const reason = strk20PoolBlockedReason();
  if (reason) throw new Strk20NotConfiguredError(reason);
}

/**
 * Deposit the hub account's USDC into the STRK20 pool as a private note.
 * Returns the deposit tx plus the note handle to persist (encrypted) on the route.
 */
// Stub: the real implementation awaits the SDK's proving + submission round trips.
// eslint-disable-next-line @typescript-eslint/require-await
export async function depositIntoStrk20Pool(
  route: PrivateRoute,
  amount: bigint
): Promise<{ txHash: string; note: string }> {
  assertReady();
  logger.info(
    `STRK20 deposit ${amount} USDC for route ${route.id} into pool ${STRK20_POOL_ADDRESS}`,
    'Strk20Pool'
  );
  // Unreachable until the SDK + endpoints land; assertReady() throws above.
  throw new Strk20NotConfiguredError('pool deposit is not implemented yet');
}

/**
 * Withdraw `amount` from the pool back to the route's Starknet hub account, once
 * the note has matured. Returns null when the note is not yet spendable, which
 * the state machine treats as "retry next tick".
 */
// Stub: the real implementation awaits the SDK's proving + submission round trips.
// eslint-disable-next-line @typescript-eslint/require-await
export async function withdrawFromStrk20Pool(
  route: PrivateRoute,
  amount: bigint
): Promise<{ txHash: string } | null> {
  assertReady();
  logger.info(`STRK20 withdraw ${amount} USDC for route ${route.id}`, 'Strk20Pool');
  throw new Strk20NotConfiguredError('pool withdrawal is not implemented yet');
}
