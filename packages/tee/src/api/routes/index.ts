// API Routes

import { Router } from 'itty-router';
import { createUserRoutes, handleGetEnsUsername, handleRegisterUser } from './user';
import { handleCcipRecordQuery } from './ccip';
import { scanForDeposits } from '../../services/deposit-monitor';
import { handleCreatePrivateRoute, handleGetPrivateRoute, handleQuotePrivateRoute } from './private-route';
import { handleGetChains, handleGetTokens } from './relay';
import { logger } from '../../managers/log';

export function createApiRoutes() {
  const router = Router();

  // Mount user routes
  const userRouter = createUserRoutes();
  router.all('/api/user/*', userRouter.handle);

  // Alias for user get name endpoint
  // GET /get/:name
  router.get('/get/:name', handleGetEnsUsername);

  // Alias for user register endpoint
  // POST /set
  router.post('/set', handleRegisterUser);

  // CCIP Record Query endpoints at root level
  // GET /lookup/:sender/:data.json
  router.get('/lookup/:sender/:data.json', handleCcipRecordQuery);

  // GET /:sender/:data.json (must come after /lookup and /get/:name to avoid conflicts)
  router.get('/:sender/:data.json', handleCcipRecordQuery);

  // Deposit monitor endpoints
  // POST /api/scan - Trigger a deposit scan manually
  router.post('/api/scan', async () => {
    try {
      logger.info('Manual deposit scan triggered', 'API');
      // Run scan in background
      scanForDeposits().catch((err) => logger.error('Scan failed', 'API', err));
      return new Response(JSON.stringify({ success: true, message: 'Scan triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to trigger scan' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  });

  // Private route (private cross-chain transfer via Relay + Railgun)
  // POST /api/private-route/quote  - preview quote (no persist, no deposit address)
  // POST /api/private-route        - create a route, returns leg-1 deposit address
  // GET  /api/private-route/:routeId - route status
  router.post('/api/private-route/quote', handleQuotePrivateRoute);
  router.post('/api/private-route', handleCreatePrivateRoute);
  router.get('/api/private-route/:routeId', handleGetPrivateRoute);

  // Relay discovery (chains + tokens for the UI selectors)
  router.get('/api/relay/chains', handleGetChains);
  router.get('/api/relay/tokens', handleGetTokens);

  return router;
}
