# 0002 — Transactional Outbox for `account.created`

## Status

Accepted

## Context

`CreateAccountUseCase` used to publish `account.created` directly to RabbitMQ after saving the new `User` +
`Account`. That's two unrelated operations against two different systems: a broker outage, or a process
crash in the exact window between the Postgres commit and the publish call, silently loses the event —
and `EventPublisher`'s own contract ("must not throw", see [architecture.md](../architecture.md)) means
nothing ever surfaces that loss. For an event meant to trigger a confirmation email, a silent loss is a real
(if low-severity) product bug, and a bad pattern to leave standing in a financial-systems showcase.

## Decision

`CreateAccountUseCase` writes `account.created` to a Postgres `outbox_events` table
(`migrations/003_create_outbox_events.sql`) from *inside* the same `UnitOfWork` transaction as the `User` +
`Account` saves, via `OutboxRepository.add()` (`PostgresOutboxRepository`). The write either commits or
rolls back together with the signup — there is no window where one exists without the other. A separate,
standalone relay process (`npm run worker:outbox-relay`, `infra/events/consumers/outbox-relay.ts`) polls
`outbox_events` for unpublished rows (default every 5s) and is the only thing that actually calls RabbitMQ
for these — deliberately not via `RabbitMQEventPublisher`, whose swallow-and-log contract is wrong for a
relay whose entire job is to notice a failed publish and retry it.

## Alternatives considered

- **Publish-then-save, or save-then-publish, directly (no outbox).** The status quo before this decision —
  rejected because it can't guarantee the event survives whichever of the two systems fails.
- **Two-phase commit (XA) across Postgres and RabbitMQ.** Rejected as unnecessary operational complexity for
  a task-queue-shaped, at-least-once event (see [0004](0004-rabbitmq-vs-kafka.md)) — the outbox pattern gets
  the same durability guarantee with plain SQL and no distributed-transaction coordinator.
- **Apply the outbox to `remittance.completed` too.** Considered and rejected — that event is
  event-stream-shaped (Kafka, replayable, feeds a best-effort search index), not task-queue-shaped; a lost
  publish there degrades a read model, not a one-time side effect, and Kafka's own retention already gives it
  a different safety margin. See [0004](0004-rabbitmq-vs-kafka.md) for the full reasoning.

## Consequences

- `account.created` delivery is now as durable as the signup row itself — a crash or broker outage delays
  the confirmation-email simulation, never silently drops it.
- A new moving part: the relay process must actually be running (`npm run worker:outbox-relay`, or the
  `worker-outbox-relay` Docker Compose service) for outbox rows to ever leave `outbox_events`. It is not part
  of `buildApp()` — forgetting to run it means `account.created` events accumulate unpublished, not that
  signups fail (the write path itself doesn't depend on the relay).
- `PostgresOutboxRepository`'s writes participate in whatever transaction is active via the same
  `AsyncLocalStorage`-based `getExecutor()` mechanism every other `Postgres*Repository` uses — no special
  wiring needed at the call site beyond calling it inside `unitOfWork.runInTransaction()`.
