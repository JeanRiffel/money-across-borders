import { EventPublisher } from '../../application/shared/events/event-publisher';
import { getKafkaProducer } from '../config/message-broker/kafka-connection';
import { logger } from '../observability/logger';

// No longer wired to any factory — remittance-factory.ts used to construct
// this directly for SendRemittanceUseCase, but remittance.completed now
// goes through the Transactional Outbox instead (see OutboxRepository /
// kafka-outbox-relay.ts), same move CreateAccountUseCase/account.created
// made earlier to RabbitMQEventPublisher, and for the same reason: this
// adapter's "never throws" contract meant a failed/unreachable broker
// silently lost the event with no way to retry. Kept anyway, same
// precedent as RabbitMQEventPublisher/PostgresIdempotencyRepository (still
// correct, just unused) — a plain best-effort EventPublisher is still the
// right shape for an event that's genuinely fine to lose occasionally.
// kafka-outbox-relay.ts's own low-level Kafka producer calls deliberately
// don't reuse this class, for the same reason rabbitmq-outbox-relay.ts doesn't reuse
// RabbitMQEventPublisher: its swallow-and-log behavior is exactly what a
// relay must NOT have.
export class KafkaEventPublisher implements EventPublisher {
  // Never throws (same contract as RabbitMQEventPublisher): a failed
  // connect/send is caught and logged here, not surfaced to the caller —
  // losing an occasional remittance.completed event means that remittance
  // doesn't show up in search until reindexed some other way, not that the
  // remittance itself fails.
  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const producer = await getKafkaProducer();
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
    } catch (error) {
      logger.warn({ error, topic }, 'Failed to publish event to Kafka');
    }
  }
}
