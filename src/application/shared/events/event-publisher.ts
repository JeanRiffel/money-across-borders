// Publishes a domain event (a topic/queue name + a serializable payload) to
// whatever messaging infra an adapter wraps. Kept generic — like
// IdempotencyRepository or UnitOfWork — rather than one typed method per
// event, so new events (e.g. a future "remittance.completed") don't require
// widening this interface.
//
// Contract: implementations MUST NOT throw/reject on a delivery failure.
// Every event published through this port so far (see CreateAccountUseCase)
// is a best-effort side effect — losing an occasional "account created"
// notification shouldn't fail the signup that triggered it, the way
// UnitOfWork exists specifically because losing a ledger write is NOT
// acceptable (see SendRemittanceUseCase). An implementation should catch
// and log its own failures instead of propagating them.
export interface EventPublisher {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>;
}
