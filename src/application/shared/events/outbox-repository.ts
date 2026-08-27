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
// src/infra/events/consumers/outbox-relay.ts.
export interface OutboxEventRecord {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface OutboxRepository {
  add(topic: string, payload: Record<string, unknown>): Promise<void>;
  findUnpublished(limit: number): Promise<OutboxEventRecord[]>;
  markPublished(id: string): Promise<void>;
}
