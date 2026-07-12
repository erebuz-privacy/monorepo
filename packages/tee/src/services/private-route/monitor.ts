// Background poller that advances non-terminal routes (mirrors deposit-monitor).

import { logger } from '../../managers/log';
import { PrivateRouteModel } from '../../database/models/private-route';
import { advancePrivateRoute } from './state-machine';

const inFlight = new Set<string>();

async function tick(): Promise<void> {
  const routes = await PrivateRouteModel.findNonTerminal();
  for (const route of routes) {
    if (inFlight.has(route.id)) continue; // a slow step (e.g. unshield proof) is still running
    inFlight.add(route.id);
    void advancePrivateRoute(route)
      .catch((err) => logger.error(`advancePrivateRoute ${route.id} failed`, 'PrivateRoute', err))
      .finally(() => inFlight.delete(route.id));
  }
}

export function startPrivateRouteMonitor(intervalMs: number): NodeJS.Timeout {
  logger.info(`Starting private-route monitor (interval ${intervalMs}ms)`, 'PrivateRoute');
  void tick().catch((err) => logger.error('private-route tick failed', 'PrivateRoute', err));
  return setInterval(() => {
    void tick().catch((err) => logger.error('private-route tick failed', 'PrivateRoute', err));
  }, intervalMs);
}

export function stopPrivateRouteMonitor(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  logger.info('Stopped private-route monitor', 'PrivateRoute');
}
