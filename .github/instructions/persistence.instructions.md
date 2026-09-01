---
applyTo: "src/infra/persistence/**,src/infra/config/database/**,src/infra/persistence/postgresql/migrations/**"
---

Persistence and infrastructure adapters — see [docs/architecture.md](../../docs/architecture.md) and
[docs/infrastructure.md](../../docs/infrastructure.md) for full context.

- **Implementations must respect the application/domain ports they implement**, not reshape them.
  A `Postgres*Repository`/`InMemory*Repository` pair implements the same interface
  (`src/domain/**/repository/*.ts`, `src/application/**/repositories/*.ts`) — behavior should be
  observably equivalent between them wherever tests exercise both (see `PostgresIdempotencyRepository`'s
  comment about `findByKey`'s exact return shape, which was once a real, silent bug when it drifted from the
  in-memory contract).
- **Financial state must stay transactionally consistent.** A repository method must not introduce a partial
  write of its own that isn't already covered by the caller's `UnitOfWork` — see `PostgresWalletRepository`'s
  upsert `save()` and how `SendRemittanceUseCase` sequences its calls inside
  `unitOfWork.runInTransaction()`. Don't add a repository method that starts its own transaction internally;
  that breaks the "everything in this call joins the caller's transaction via `getExecutor()`" contract every
  other `Postgres*Repository` relies on.
- **Don't move business rules into a repository.** No balance checks, no double-entry validation, no
  compliance logic here — those belong in `src/domain/**`/`src/application/**` (see
  [domain.instructions.md](domain.instructions.md)). A repository's job is mapping rows to/from entities and
  executing the query it's asked for.
- **Respect the `UnitOfWork`/transaction boundary that already exists** — see ADR
  [0007](../../docs/adr/0007-unit-of-work-transaction-boundary.md). Know the one documented gap it leaves
  open before "fixing" concurrency issues here casually: no `SELECT ... FOR UPDATE` row lock is taken on
  wallet reads today (see the "Wallet" section of [docs/invariants.md](../../docs/invariants.md) and
  [docs/concurrency-lab.md](../../docs/concurrency-lab.md), which demonstrates the fix pattern in an
  isolated lab, not wired into the production path). If you *are* asked to close that gap, do it
  deliberately and update `invariants.md` in the same change — don't let it happen as an incidental side
  effect of something else.
- **Don't bypass existing consistency mechanisms** — the Transactional Outbox
  (`outbox_events`/`OutboxRepository`, ADR [0002](../../docs/adr/0002-transactional-outbox.md)),
  `EventPublisher`'s "must not throw" contract, and the idempotency `claim()`/`save()`/`release()` sequence
  (ADR [0003](../../docs/adr/0003-redis-backed-idempotency.md)) all exist for specific, documented reasons —
  see [docs/invariants.md](../../docs/invariants.md)'s "Idempotency" and "Transactional consistency"
  sections before changing how any of them behave.
- **Migrations are additive by default.** New numbered file under `migrations/`, never edit an
  already-applied one in place — see the existing files for the expected style (a comment block explaining
  *why*, `IF NOT EXISTS`/`ON CONFLICT DO NOTHING` where it makes a migration safely re-runnable). Never run a
  destructive migration or `--reset` against anything but your own local/dev database without explicit
  authorization.
- Postgres and Redis are fatal-at-boot dependencies; RabbitMQ/Kafka/Elasticsearch/Mongo are not — know which
  category a change falls into before assuming a degraded connection should either block boot or be ignored.
  See [docs/infrastructure.md](../../docs/infrastructure.md).
