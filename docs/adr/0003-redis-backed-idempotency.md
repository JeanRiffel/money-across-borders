# 0003 — Redis-backed idempotency instead of Postgres

## Status

Accepted

## Context

`account`/`wallet`/`remittance`/`kyc` all need idempotency: a client retrying a request with the same
`Idempotency-Key` (network timeout, client-side retry logic) must not re-run a side-effecting use case a
second time. A `PostgresIdempotencyRepository` (backed by `idempotency_records`, `key UNIQUE`) already
existed and worked correctly. The claim/save/release pattern (`IdempotentDecorator`, see
[architecture.md](../architecture.md)) needs a fast atomic reservation (`claim()`), a bounded-lifetime cache
of the response (`save()`), and a safe way to release a reservation that never completed (`release()`).

## Decision

`account-factory.ts`/`wallet-factory.ts`/`remittance-factory.ts`/`compliance-factory.ts` wire
`idempotencyRepository` to `RedisIdempotencyRepository` (`infra/persistence/redis/`), not the Postgres
adapter. `claim()` is `SET key IN_FLIGHT NX EX 30` (atomic reservation with a 30s in-flight TTL), `save()`
overwrites the key with the response under a 24h TTL, and `release()` uses a Lua check-and-delete script so
it can never clobber a response a concurrent `save()` already wrote. `server.ts` treats Redis as load-bearing
— it fails fast at boot if Redis is unreachable, the same way it does for Postgres.
`PostgresIdempotencyRepository` is kept, correct, and exercised directly by
[docs/concurrency-lab.md](../concurrency-lab.md)'s idempotency demo, but unused by any factory.

## Alternatives considered

- **Keep Postgres as the idempotency store.** Rejected as the production choice (though kept as a working,
  documented alternative): idempotency records are high-churn, short-lived, and don't need to survive a
  restart the way ledger data does — a TTL-based cache is a more natural fit than rows that would otherwise
  need a separate cleanup job, and keeping this traffic off the same database as the financial write path
  avoids adding contention to it for a concern that's really about request deduplication, not durability.
- **In-process cache (e.g. an LRU map).** Rejected — doesn't survive a process restart and doesn't work
  across multiple app instances, which defeats the purpose for a horizontally-scaled deployment (an explicit
  goal of this project).

## Consequences

- Idempotency and the financial write path now depend on two different systems (Redis, Postgres) with no
  cross-system transaction between them — see the "Idempotency" section of
  [docs/invariants.md](../invariants.md) for exactly what is and isn't guaranteed across that boundary.
- Redis becomes a second fatal-at-boot dependency alongside Postgres — running the app locally now requires
  both reachable and, for Postgres, migrated. See [docs/infrastructure.md](../infrastructure.md).
- The crash-between-claim-and-response trade-off (fail closed, not fail open — see `IdempotentDecorator`'s
  own comment and [docs/invariants.md](../invariants.md)) is identical regardless of which backing store is
  used; this decision is about *where* the reservation lives, not the concurrency contract itself.
