import { startFakeFxServer } from './fake-fx-server';
import { logger } from '../observability/logger';

// Standalone entrypoint for local/manual exercising of HttpExchangeRateProvider
// against a real (if fake) HTTP server — see docs/resilience.md. Not part of
// buildApp() or any worker:* process; run it alongside the app
// (FX_PROVIDER=http FX_PROVIDER_URL=http://localhost:<port>) to see the
// resilience layer's timeout/retry/backoff/circuit-breaker behavior against
// real network calls without depending on a third-party FX API.
//
// Every response defaults to 'success' (the real rate table) unless a
// request sends an X-Simulate header — see fake-fx-server.ts's
// SimulatedBehavior union for the values it accepts.
const PORT = Number(process.env.FAKE_FX_SERVER_PORT) || 4010;

if (require.main === module) {
  startFakeFxServer(PORT)
    .then((server) => {
      logger.info(
        `Fake FX server listening on ${server.url} (send X-Simulate to script a failure)`
      );
    })
    .catch((error) => {
      logger.error({ error }, 'Failed to start fake FX server');
      process.exit(1);
    });
}
