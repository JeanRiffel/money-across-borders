// Single shared logger for the whole app, replacing scattered console.*
// calls. Always logs pretty to stdout; additionally ships structured logs to
// Loki when LOKI_URL is set. Pino transports run in worker threads, so
// neither target blocks the main event loop, and pino-loki reports its own
// push failures to stderr instead of throwing — an unreachable Loki degrades
// to stdout-only logging rather than crashing the app.
import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const serviceName = process.env.OTEL_SERVICE_NAME || 'money-across-borders';
const lokiUrl = process.env.LOKI_URL;

const targets: pino.TransportTargetOptions[] = [
  {
    target: 'pino-pretty',
    level,
    options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
  },
];

if (lokiUrl) {
  targets.push({
    target: 'pino-loki',
    level,
    options: {
      host: lokiUrl,
      labels: { service_name: serviceName, env: process.env.NODE_ENV || 'development' },
    },
  });
}

export const logger = pino({ level }, pino.transport({ targets }));
