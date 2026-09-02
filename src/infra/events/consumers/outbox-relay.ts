import { postgresRegistry } from '../../persistence/postgresql/postgres-registry';
import { connectRabbitMQ } from '../../config/message-broker/rabbitmq-connection';
import { logger } from '../../observability/logger';

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_RELAY_INTERVAL_MS) || 5000;
const BATCH_SIZE = 50;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Runs as its own long-running process (see the worker:outbox-relay npm
// script), same shape as account-created-consumer.ts /
// remittance-completed-indexer.ts — not part of buildApp(). Unlike those
// two, this one doesn't consume from a broker topic; it polls the
// outbox_events table (see migrations/003_create_outbox_events.sql) written
// by CreateAccountUseCase inside its Postgres transaction (see
// PostgresOutboxRepository / OutboxRepository) and is the only thing that
// actually calls RabbitMQ for account.created.
//
// Deliberately does NOT go through RabbitMQEventPublisher: that adapter's
// contract is "never throws" (see EventPublisher), which is exactly wrong
// here — this relay's entire reason to exist is to notice a failed publish
// and retry it, so it talks to connectRabbitMQ() directly and lets a
// failure propagate up to relayOnce()'s per-event catch below, which simply
// leaves the row unpublished for the next poll instead of calling
// markPublished(). No exponential backoff or attempt-count bookkeeping
// today — a fixed poll interval is enough to eventually drain a queue built
// up during a RabbitMQ outage once it's reachable again.
async function relayOnce(): Promise<void> {
  const events = await postgresRegistry.outboxRepository.findUnpublished(BATCH_SIZE);
  if (events.length === 0) return;

  const { channel } = await connectRabbitMQ();

  for (const event of events) {
    try {
      // Same publish shape as RabbitMQEventPublisher.publish() — topic
      // doubles as the queue name, durable queue + persistent message so a
      // queued event survives a broker restart before a consumer picks it
      // up.
      await channel.assertQueue(event.topic, { durable: true });
      channel.sendToQueue(event.topic, Buffer.from(JSON.stringify(event.payload)), {
        persistent: true,
        contentType: 'application/json',
        // Stable dedupe key for the consumer's idempotency guard (see
        // account-created-consumer.ts) — the outbox row's own id, so
        // duplicate delivery/redelivery of the *same* logical event always
        // carries the same messageId, across both a raw broker redelivery
        // and this project's own retry-queue republish (which forwards this
        // property verbatim rather than minting a new one).
        messageId: event.id,
      });
      await postgresRegistry.outboxRepository.markPublished(event.id);
      logger.info(
        { id: event.id, topic: event.topic },
        `Relayed outbox event ${event.id} (${event.topic})`
      );
    } catch (error) {
      logger.warn(
        { error, id: event.id, topic: event.topic },
        'Failed to relay outbox event, will retry next poll'
      );
    }
  }
}

export const runOutboxRelay = async (): Promise<void> => {
  logger.info(`Outbox relay polling every ${POLL_INTERVAL_MS}ms...`);

  for (;;) {
    try {
      await relayOnce();
    } catch (error) {
      // Covers findUnpublished()/connectRabbitMQ() itself failing (e.g.
      // Postgres or RabbitMQ unreachable) — logged and retried next tick,
      // same posture as a per-event failure inside relayOnce().
      logger.error({ error }, 'Outbox relay tick failed');
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

// Guarded like the other consumers/server.ts's startServer(): only runs
// when this file is the actual entrypoint.
if (require.main === module) {
  runOutboxRelay().catch((error) => {
    logger.error({ error }, 'Failed to start outbox relay');
    process.exit(1);
  });
}
