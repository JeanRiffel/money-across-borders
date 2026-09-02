# Architecture Decision Records

An ADR captures one significant architectural decision — the context that forced it, the choice made, what
else was on the table, and the trade-offs accepted. It's a record of *why*, for humans and AI agents reading
the code later, not a design spec and not a changelog.

## When to write one

Write an ADR for a decision that would be genuinely confusing to reverse-engineer from the code alone —
"why Postgres and not just the in-memory repos", "why two message brokers instead of one", "why treasury
wallets instead of direct FX posting". Don't write one for routine implementation choices, naming, or
anything a docstring already explains adequately.

This project starts with a small set covering decisions that already exist in the codebase (see the index
below) — it does not retroactively invent decisions that weren't actually made, and it isn't meant to grow
to cover every choice in the tree. Add a new ADR only when a comparably significant decision is made or
revisited; most changes don't need one.

## Format

Each ADR is a numbered file, `NNNN-short-kebab-title.md`, using the next available number. Keep it short —
half a page to a page is normal. Sections:

- **Status** — `Proposed`, `Accepted`, `Superseded by NNNN`, or `Deprecated`. All ADRs below are `Accepted`
  (they document decisions already implemented).
- **Context** — the problem/constraints that made a decision necessary.
- **Decision** — what was actually decided, stated plainly.
- **Alternatives considered** — the realistic other options and why they lost, not a straw-man list.
- **Consequences** — what this buys, what it costs, what it leaves as a known gap. Link to
  [docs/invariants.md](../invariants.md) or [docs/known-issues.md](../known-issues.md) where a consequence
  is a documented limitation rather than a hypothetical trade-off.

Once accepted, an ADR is not edited to match later changes — if a decision is reversed or replaced, write a
new ADR and mark the old one `Superseded by NNNN`.

## Index

| # | Decision |
|---|---|
| [0001](0001-postgres-as-financial-source-of-truth.md) | PostgreSQL as the financial source of truth |
| [0002](0002-transactional-outbox.md) | Transactional Outbox for `account.created` |
| [0003](0003-redis-backed-idempotency.md) | Redis-backed idempotency instead of Postgres |
| [0004](0004-rabbitmq-vs-kafka.md) | RabbitMQ vs. Kafka, chosen per event |
| [0005](0005-elasticsearch-read-model.md) | Elasticsearch as a CQRS read model for remittance search |
| [0006](0006-treasury-wallets-cross-currency.md) | System-owned treasury wallets for cross-currency ledger balancing |
| [0007](0007-unit-of-work-transaction-boundary.md) | `UnitOfWork` as the transaction boundary for `SendRemittanceUseCase` |
| [0008](0008-resilience-layer.md) | Resilience layer: `cockatiel`, and a broker-native RabbitMQ retry/DLQ |
