// Bootstraps OpenTelemetry tracing (OTLP HTTP → Tempo). Must be the very
// first thing required by the process — auto-instrumentation works by
// monkey-patching modules (express, http, pg, ...) at `require()` time, so
// this needs to run before anything it instruments gets imported. That's why
// `src/main/server.ts` imports this file as its first line, ahead of every
// other import.
import dotenv from 'dotenv';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

dotenv.config();

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const serviceName = process.env.OTEL_SERVICE_NAME || 'money-across-borders';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Noisy and not useful for tracing a request's flow through this app.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

// Tracing is a side-channel: Tempo being unreachable must never stop the app
// from starting or serving requests, so this is try/caught rather than
// awaited/thrown like the Postgres check in server.ts.
try {
  sdk.start();
  console.log(`✓ OpenTelemetry tracing started (exporting to ${otlpEndpoint})`);
} catch (error) {
  console.error('⚠ OpenTelemetry tracing failed to start, continuing without it:', error);
}

const shutdownTracing = (): void => {
  sdk
    .shutdown()
    .catch((error) => console.error('⚠ Error shutting down OpenTelemetry tracing:', error));
};
process.on('SIGTERM', shutdownTracing);
process.on('SIGINT', shutdownTracing);
