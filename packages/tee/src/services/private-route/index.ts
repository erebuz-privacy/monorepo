// Private Route: a private cross-chain transfer router.
//
// Bridge in via Relay to a TEE-owned Nexus hub account, shield -> unshield
// through Railgun (the on-chain privacy break), then bridge out via Relay to the
// user's destination address. See the sibling modules for each concern:
//   - create.ts        route creation + leg-1 deposit address
//   - state-machine.ts  per-route step transitions
//   - monitor.ts        background poller
//   - types.ts / tokens.ts

export type { CreatePrivateRouteInput, CreatePrivateRouteResult } from './types';
export type { QuotePrivateRouteInput, QuotePrivateRouteResult } from './quote';
export { createPrivateRoute, getPrivateRoute } from './create';
export { quotePrivateRoute } from './quote';
export { advancePrivateRoute } from './state-machine';
export { startPrivateRouteMonitor, stopPrivateRouteMonitor } from './monitor';
export { TERMINAL_STATUSES } from '../../database/models/private-route';
