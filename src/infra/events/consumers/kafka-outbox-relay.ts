import { postgresRegistry } from '../../persistence/postgresql/postgres-registry';
import { getKafkaProducer } from '../../config/message-broker/kafka-connection';
import { logger } from '../../observability/logger';

const POLL_INTERVAL_MS = Number(process.env.KAFKA_OUTBOX_RELAY_INTERVAL_MS) || 5000;
const BATCH_SIZE = 50;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Kafka counterpart to outbox-relay.ts — deliberately a separate process
// rather than a shared/parameterized one, so the RabbitMQ and Kafka relays
// can evolve independently (retry shape, batching, polling cadence) without
// entangling two brokers' concerns in one file. Polls the same
// outbox_events table (see migrations/003_create_outbox_events.sql,
// 005_add_outbox_broker_column.sql) written by SendRemittanceUseCase inside
// its Postgres transaction (see PostgresOutboxRepository / OutboxRepository),
// scoped to broker='kafka' so it only ever claims rows outbox-relay.ts (which
// defaults to broker='rabbitmq') never touches, and vice versa.
//
// Deliberately does NOT go through KafkaEventPublisher: that adapter's
// contract is "never throws" (see EventPublisher), which is exactly wrong
// here — this relay's entire reason to exist is to notice a failed publish
// and retry it, so it talks to getKafkaProducer() directly and lets a
// failure propagate up to relayOnce()'s per-event catch below, which simply
// leaves the row unpublished for the next poll instead of calling
// markPublished(). No exponential backoff or attempt-count bookkeeping
// today — a fixed poll interval is enough to eventually drain a queue built
// up during a Kafka outage once it's reachable again.
async function relayOnce(): Promise<void> {
  const events = await postgresRegistry.outboxRepository.findUnpublished(BATCH_SIZE, 'kafka');
  if (events.length === 0) return;

  const producer = await getKafkaProducer();

  for (const event of events) {
    try {
      // Same publish shape as KafkaEventPublisher.publish() — the outbox
      // row's own id as the message key, so redelivery/reprocessing of the
      // same logical event is at least identifiable by consumers that care
      // to dedupe, mirroring the messageId stamped by outbox-relay.ts for
      // its own RabbitMQ messages.
      await producer.send({
        topic: event.topic,
        messages: [{ key: event.id, value: JSON.stringify(event.payload) }],
      });
      await postgresRegistry.outboxRepository.markPublished(event.id);
      logger.info(
        { id: event.id, topic: event.topic },
        `Relayed outbox event ${event.id} (${event.topic}) to Kafka`
      );
    } catch (error) {
      logger.warn(
        { error, id: event.id, topic: event.topic },
        'Failed to relay outbox event to Kafka, will retry next poll'
      );
    }
  }
}

export const runKafkaOutboxRelay = async (): Promise<void> => {
  logger.info(`Kafka outbox relay polling every ${POLL_INTERVAL_MS}ms...`);

  for (;;) {
    try {
      await relayOnce();
    } catch (error) {
      // Covers findUnpublished()/getKafkaProducer() itself failing (e.g.
      // Postgres or Kafka unreachable) — logged and retried next tick, same
      // posture as a per-event failure inside relayOnce().
      logger.error({ error }, 'Kafka outbox relay tick failed');
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

// Guarded like the other consumers/server.ts's startServer(): only runs
// when this file is the actual entrypoint.
if (require.main === module) {
  runKafkaOutboxRelay().catch((error) => {
    logger.error({ error }, 'Failed to start Kafka outbox relay');
    process.exit(1);
  });
}
