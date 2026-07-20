// Relay discovery API handlers — proxy Relay's supported chains + tokens so the
// UI selectors show the real deposit-address-bridgeable set (correct addresses
// and decimals), meaning every route the user can pick is actually routable.
// GET /api/relay/chains
// GET /api/relay/tokens?chainId=&search=

import { logger } from '../../managers/log';
import { getRelayChains, getRelayCurrencies } from '../../services/relay';
import { cctpChains, cctpSupportsChain, cctpUsdc } from '../../services/cctp';
import { BRIDGE_PROVIDER } from '../../config/global-config';

const CCTP = BRIDGE_PROVIDER === 'cctp';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET /api/relay/chains */
export async function handleGetChains(): Promise<Response> {
  try {
    // CCTP mode: only the CCTP-supported chains (USDC bridged natively).
    const chains = CCTP ? cctpChains() : await getRelayChains();
    return jsonResponse({ success: true, data: chains });
  } catch (error) {
    logger.error('Error in GET /api/relay/chains', 'RelayAPI', error);
    return jsonResponse({ success: false, error: 'Failed to list chains' }, 500);
  }
}

/** GET /api/relay/tokens?chainId=&search= */
export async function handleGetTokens(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const chainId = Number(url.searchParams.get('chainId'));
    const search = url.searchParams.get('search') || undefined;
    if (!Number.isFinite(chainId) || chainId <= 0) {
      return jsonResponse({ success: false, error: 'Invalid request: chainId is required' }, 400);
    }
    // CCTP mode: USDC is the only bridgeable token.
    if (CCTP) {
      const data = cctpSupportsChain(chainId)
        ? [{ chainId, address: cctpUsdc(chainId), symbol: 'USDC', name: 'USD Coin', decimals: 6, logoUrl: null }]
        : [];
      return jsonResponse({ success: true, data });
    }
    const tokens = await getRelayCurrencies({ chainId, term: search });
    return jsonResponse({ success: true, data: tokens });
  } catch (error) {
    logger.error('Error in GET /api/relay/tokens', 'RelayAPI', error);
    return jsonResponse({ success: false, error: 'Failed to list tokens' }, 500);
  }
}
