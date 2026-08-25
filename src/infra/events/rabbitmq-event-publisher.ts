import { EventPublisher } from "../../application/shared/events/event-publisher"
import { connectRabbitMQ } from "../config/message-broker/rabbitmq-connection"
import { logger } from "../observability/logger"

// No longer wired to any factory — account-factory.ts used to construct
// this directly for CreateAccountUseCase, but account.created now goes
// through the Transactional Outbox instead (see OutboxRepository /
// outbox-relay.ts), specifically because this adapter's "never throws"
// contract meant a failed/unreachable broker silently lost the event with
// no way to retry. Kept anyway, same precedent as PostgresIdempotencyRepository
// (still correct, just unused) — a plain best-effort EventPublisher is
// still the right shape for an event that's genuinely fine to lose
// occasionally, and outbox-relay.ts's own low-level RabbitMQ calls
// deliberately don't reuse this class (its swallow-and-log behavior is
// exactly what the relay needs to NOT have).
export class RabbitMQEventPublisher implements EventPublisher {

  // Never throws (see EventPublisher's contract comment): both a failed
  // connection and a failed publish are caught and logged here rather than
  // surfaced to the caller, so a use case awaiting this never has to treat
  // "the broker is down" as a reason to fail whatever it's doing.
  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const { channel } = await connectRabbitMQ()
      // The topic doubles as the queue name — durable so a queued event
      // survives a broker restart before a consumer picks it up; messages
      // are marked persistent below for the same reason.
      await channel.assertQueue(topic, { durable: true })
      channel.sendToQueue(topic, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
        contentType: 'application/json',
      })
    } catch (error) {
      logger.warn({ error, topic }, 'Failed to publish event to RabbitMQ')
    }
  }

}
