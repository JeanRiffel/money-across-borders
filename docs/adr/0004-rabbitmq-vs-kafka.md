# 0004 — RabbitMQ vs. Kafka, chosen per event

## Status

Accepted

## Context

Two domain events cross a message broker today: `account.created` (triggers a simulated confirmation email)
and `remittance.completed` (feeds the Elasticsearch search index). They have different consumption shapes:
`account.created` has exactly one consumer and no reason anyone would need to replay it later; a business
fact like a completed remittance, by contrast, is plausibly useful to more than one consumer over time
(indexing today; analytics/audit are obvious future ones) and benefits from being replayable.

## Decision

Pick the broker per event based on how it's meant to be consumed, not "whichever broker already exists":

- `account.created` → RabbitMQ, via the Transactional Outbox (see [0002](0002-transactional-outbox.md)) and
  a single consumer (`npm run worker:account-created`). Task-queue-shaped: one event, one job, done.
- `remittance.completed` → Kafka, published by `SendRemittanceUseCase` directly (after its transaction
  commits) to `KafkaEventPublisher`, consumed by `npm run worker:remittance-indexer`. Event-stream-shaped:
  Kafka's retention/consumer-group replay model fits "a business fact other things may want to read later" in
  a way RabbitMQ's work-queue model doesn't.

Both adapters (`infra/events/`) share `EventPublisher`'s contract: implementations must not throw — every
publish is a best-effort side effect, never a correctness guarantee for the underlying financial write.

## Alternatives considered

- **One broker for everything (RabbitMQ only, or Kafka only).** Rejected — would have been simpler
  operationally, but forces every event into whichever model doesn't fit it (an unnecessary work queue for a
  replayable stream, or unnecessary retention/partitioning machinery for a single-consumer task). The project
  explicitly wants to demonstrate the *reasoning*, not just wire up messaging.
- **Apply the Transactional Outbox to `remittance.completed` too, for symmetry.** Rejected — see
  [0002](0002-transactional-outbox.md)'s "Alternatives considered": this event already gets a different,
  arguably sufficient safety net from Kafka's own retention, and the outbox's operational cost (a relay
  process, an extra table) isn't judged worth it for a best-effort read-model update.

## Consequences

- Running the full stack requires two message brokers instead of one — more moving parts in
  `docker-compose.yml` and more services to reason about when something in the events path misbehaves. See
  [docs/infrastructure.md](../infrastructure.md) for exactly what each backs and how each degrades.
- Neither broker is fatal-at-boot — `remittance.completed`/`account.created` delivery failures degrade a
  read model or delay a simulated email, never the wallet/ledger/remittance write path itself. This is a
  direct consequence of `EventPublisher`'s never-throws contract, applied consistently to both adapters.
- `RabbitMQEventPublisher` itself (the generic adapter, as opposed to the outbox relay's direct publish call)
  is currently unused by any factory — kept as a correct, documented reference implementation of the
  `EventPublisher` port on RabbitMQ, not dead code to be deleted without checking first.
