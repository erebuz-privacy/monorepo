// Private Route API handlers
// POST /api/private-route/quote  -> preview quote (no persist, no deposit address)
// POST /api/private-route        -> create a route, returns leg-1 deposit address
// GET  /api/private-route/:routeId -> route status

import { logger } from '../../managers/log';
import { createPrivateRoute, getPrivateRoute, quotePrivateRoute } from '../../services/private-route';

// These payloads contain Dates (serialized as ISO strings by JSON.stringify) and
// no BigInts, so plain JSON.stringify is correct here (convertBigIntToString would
// mangle Date objects into {}).
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function statusForError(message: string): number {
  if (message.includes('Invalid') || message.includes('Unsupported')) return 400;
  if (message.includes('not found')) return 404;
  return 500;
}

/** POST /api/private-route/quote */
export async function handleQuotePrivateRoute(request: Request): Promise<Response> {
  try {
    logger.info('POST /api/private-route/quote', 'PrivateRouteAPI');
    const body = (await request.json()) as {
      sourceChainId?: number;
      destChainId?: number;
      amount?: string;
      tokenSymbol?: string;
      destTokenSymbol?: string;
      privacyProvider?: 'railgun' | 'arc';
    };

    if (typeof body.sourceChainId !== 'number' || typeof body.destChainId !== 'number') {
      throw new Error('Invalid request: sourceChainId and destChainId (numbers) are required');
    }
    if (!body.amount || typeof body.amount !== 'string') {
      throw new Error('Invalid request: amount (string) is required');
    }

    const result = await quotePrivateRoute({
      sourceChainId: body.sourceChainId,
      destChainId: body.destChainId,
      amount: body.amount,
      tokenSymbol: body.tokenSymbol,
      destTokenSymbol: body.destTokenSymbol,
      privacyProvider: body.privacyProvider,
    });

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to quote private route';
    logger.error('Error in POST /api/private-route/quote', 'PrivateRouteAPI', error);
    return jsonResponse({ success: false, error: message }, statusForError(message));
  }
}

/** POST /api/private-route */
export async function handleCreatePrivateRoute(request: Request): Promise<Response> {
  try {
    logger.info('POST /api/private-route', 'PrivateRouteAPI');
    const body = (await request.json()) as {
      sourceChainId?: number;
      destChainId?: number;
      amount?: string;
      userDestinationAddress?: string;
      tokenSymbol?: string;
      destTokenSymbol?: string;
      privacyProvider?: 'railgun' | 'arc';
    };

    if (typeof body.sourceChainId !== 'number' || typeof body.destChainId !== 'number') {
      throw new Error('Invalid request: sourceChainId and destChainId (numbers) are required');
    }
    if (!body.amount || typeof body.amount !== 'string') {
      throw new Error('Invalid request: amount (string) is required');
    }
    if (!body.userDestinationAddress || typeof body.userDestinationAddress !== 'string') {
      throw new Error('Invalid request: userDestinationAddress is required');
    }

    const result = await createPrivateRoute({
      sourceChainId: body.sourceChainId,
      destChainId: body.destChainId,
      amount: body.amount,
      userDestinationAddress: body.userDestinationAddress,
      tokenSymbol: body.tokenSymbol,
      destTokenSymbol: body.destTokenSymbol,
      privacyProvider: body.privacyProvider,
    });

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create private route';
    logger.error('Error in POST /api/private-route', 'PrivateRouteAPI', error);
    return jsonResponse({ success: false, error: message }, statusForError(message));
  }
}

/** GET /api/private-route/:routeId */
export async function handleGetPrivateRoute(request: Request): Promise<Response> {
  try {
    const { routeId } = (request as { params?: { routeId?: string } }).params || {};
    if (!routeId) {
      throw new Error('Invalid request: routeId is required');
    }

    const route = await getPrivateRoute(routeId);
    if (!route) {
      throw new Error('Route not found');
    }

    // Pool nullifiers/secrets are operator-private and must never cross the API.
    const publicRoute: Partial<typeof route> = { ...route };
    delete publicRoute.privacyPayload;
    return jsonResponse({ success: true, data: publicRoute });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get private route';
    return jsonResponse({ success: false, error: message }, statusForError(message));
  }
}
