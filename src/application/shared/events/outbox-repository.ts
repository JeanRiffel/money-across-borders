// Transactional Outbox port: a use case that needs to guarantee an event is
// never lost writes it here — via add() — instead of calling EventPublisher
// directly. Unlike EventPublisher (see event-publisher.ts — "must not
// throw", best-effort), add() is meant to be called *inside* the same
// UnitOfWork transaction as the business write it accompanies (the Postgres
// implementation just does a plain INSERT through the shared getExecutor(),
// so it transparently joins whatever transaction is in flight), which is
// what makes the event durable even if the process crashes or the broker is
// unreachable immediately afterward. A separate relay process is the only
// thing that calls findUnpublished()/markPublished() — see
// src/infra/events/consumers/rabbitmq-outbox-relay.ts (RabbitMQ) and
// kafka-outbox-relay.ts (Kafka) — one relay per broker, each claiming only
// its own rows via the broker param below.
//
// broker defaults to 'rabbitmq' on both add() and findUnpublished() so
// CreateAccountUseCase's existing calls (account.created, RabbitMQ) and
// rabbitmq-outbox-relay.ts's existing findUnpublished(BATCH_SIZE) call keep behaving
// exactly as before this param was introduced — see migrations/
// 005_add_outbox_broker_column.sql. SendRemittanceUseCase is the one caller
// that passes 'kafka' explicitly.
export type OutboxBroker = 'rabbitmq' | 'kafka';

export interface OutboxEventRecord {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  broker: OutboxBroker;
  createdAt: Date;
}

export interface OutboxRepository {
  add(topic: string, payload: Record<string, unknown>, broker?: OutboxBroker): Promise<void>;
  findUnpublished(limit: number, broker?: OutboxBroker): Promise<OutboxEventRecord[]>;
  markPublished(id: string): Promise<void>;
}
