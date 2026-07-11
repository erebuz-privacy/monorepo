// TEE Server - Stealth Addresses, ENS Resolution, and NEAR Intent Swaps

import { Router } from 'itty-router';
import { logger } from './src/managers/log';
import { dbManager } from './src/managers/db';
import { createApiRoutes } from './src/api/routes';
import { startDepositMonitor, stopDepositMonitor } from './src/services/deposit-monitor';
import { DEPOSIT_MONITOR_ENABLED, DEPOSIT_MONITOR_INTERVAL_MS } from './src/config/global-config';
import { handleCcipRecordQuery } from './src/api/routes/ccip';

// Create main router instance
const router = Router();

// Define root route
router.get('/', () => {
  return new Response('Hello World', {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
});

// Mount API routes
const apiRouter = createApiRoutes();
router.all('/api/*', apiRouter.handle);

// Mount root-level alias routes (these are defined in apiRouter but need to be at root)
// These routes are aliases for convenience
router.get('/get/:name', (request) => {
  // Forward to apiRouter's /get/:name handler
  return apiRouter.handle(request);
});
router.post('/set', (request) => {
  // Forward to apiRouter's /set handler
  return apiRouter.handle(request);
});

// CCIP Record Query endpoints at root level (for ENS off-chain resolver)
// These must be at root level, not under /api/
// Handle /lookup/:sender/:data.json format
router.get('/lookup/*', handleCcipRecordQuery);

// Handle /:sender/:data.json format (catch-all for root-level CCIP requests)
// This must come after more specific routes like /get/:name
router.get('/*', (request) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Only handle if it looks like a CCIP request (has .json suffix and 2+ path parts)
  if (pathParts.length >= 2 && pathParts[pathParts.length - 1].endsWith('.json')) {
    return handleCcipRecordQuery(request);
  }
  
  // Otherwise, return 404
  return new Response('Not Found', { status: 404 });
});

// Deposit monitor timer
let depositMonitorTimer: NodeJS.Timeout | null = null;

// Initialize database connection
async function initializeDatabase() {
  try {
    await dbManager.connect();
  } catch (error) {
    logger.error('Failed to initialize database', 'Server', error);
    logger.error('Make sure the database exists. Run: bun run db:init', 'Server');
    process.exit(1);
  }
}

// Start the server
async function startServer() {
  // Connect to database first
  await initializeDatabase();

  const server = Bun.serve({
    port: 3000,
    async fetch(request: Request): Promise<Response> {
      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Handle the actual request
      const response = await router.handle(request) || new Response('Not Found', { status: 404 });

      // Add CORS headers to all responses
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  });

  logger.info(`Server is running at http://localhost:${server.port}`, 'Server');
  logger.info('Available routes:', 'Server');
  logger.info('  GET  /', 'Routes');
  logger.info('  GET  /api/user/get/:name', 'Routes');
  logger.info('  POST /api/user/register', 'Routes');
  logger.info('  POST /api/scan', 'Routes');
  logger.info('  GET  /lookup/:sender/:data.json', 'Routes');
  logger.info('  GET  /:sender/:data.json', 'Routes');

  // Start deposit monitor if enabled
  if (DEPOSIT_MONITOR_ENABLED) {
    logger.info(`Starting deposit monitor (interval: ${DEPOSIT_MONITOR_INTERVAL_MS}ms)`, 'Server');
    depositMonitorTimer = startDepositMonitor(DEPOSIT_MONITOR_INTERVAL_MS);
  } else {
    logger.info('Deposit monitor disabled', 'Server');
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down server...', 'Server');
    if (depositMonitorTimer) {
      stopDepositMonitor(depositMonitorTimer);
    }
    await dbManager.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down server...', 'Server');
    if (depositMonitorTimer) {
      stopDepositMonitor(depositMonitorTimer);
    }
    await dbManager.disconnect();
    process.exit(0);
  });
}

// Start the application
startServer().catch((error) => {
  logger.error('Failed to start server', 'Server', error);
  process.exit(1);
});
