# 0007 — `UnitOfWork` as the transaction boundary for `SendRemittanceUseCase`

## Status

Accepted

## Context

A remittance touches multiple aggregates in one logical operation: the sender's wallet, the recipient's
wallet, one or two treasury wallets, a set of ledger entries, and the `Remittance` record itself. If any one
of those writes fails partway through — after some but not all of the others have already run — the system
is left with a partial posting: money debited from a sender with no matching credit anywhere, or ledger legs
that don't balance. The application layer needs a way to express "all of this commits, or none of it does"
without threading a database connection/transaction object through every repository method signature.

## Decision

`application/shared/transaction/unit-of-work.ts` defines a `UnitOfWork` port:
`runInTransaction<T>(work: () => Promise<T>): Promise<T>`. `SendRemittanceUseCase.execute()` wraps its
entire `doExecute()` body in one `unitOfWork.runInTransaction()` call.
`PostgresUnitOfWork` (`infra/persistence/postgresql/postgres-unit-of-work.ts`) checks out one connection,
runs `BEGIN`, executes `work()` with that connection published via `AsyncLocalStorage`
(`transactionContext` in `pg.ts`) so every `Postgres*Repository` call made during the callback picks it up
transparently through a shared `getExecutor()` helper, then `COMMIT`s on success or `ROLLBACK`s and rethrows
on any error. `InMemoryUnitOfWork` is a no-op passthrough (`return work()`), so `npm test`'s use-case suite
exercises the exact same call shape without needing a real transaction.

## Alternatives considered

- **Pass a transaction/connection object explicitly through every repository method.** Rejected —
  would leak a Postgres-specific concept (`PoolClient`) into domain/application-layer method signatures that
  are supposed to depend only on port interfaces, and would need every repository call site updated whenever
  a new one needed to join a transaction.
- **No explicit transaction boundary — best-effort sequential writes with manual compensation on failure.**
  Rejected — compensation logic (undoing a partial set of financial writes by hand) is strictly harder to get
  right than relying on the database's own rollback, and is exactly the kind of thing this project's
  ACID-transactions goal exists to demonstrate doing correctly instead.
- **Row-level locking (`SELECT ... FOR UPDATE`) on the wallets read inside the transaction**, to also close
  the concurrent-write gap described below. Deliberately deferred, not rejected — see "Consequences".

## Consequences

- **Atomicity is guaranteed**: a thrown error anywhere in `doExecute()` rolls back every write made so far in
  that call. There is no reachable partially-posted remittance via the live HTTP flow.
- **Isolation from a concurrent transaction on the same wallet row is not guaranteed.** `UnitOfWork` gives
  all-or-nothing for *one* transaction's writes; it does not by itself prevent two concurrent transactions
  from both reading the same wallet's pre-write balance and one silently overwriting the other's effect on
  commit. This is a known, real gap — see the "Wallet" section of [docs/invariants.md](../invariants.md) and
  [docs/concurrency-lab.md](../concurrency-lab.md), which demonstrates both the mechanism (isolation levels,
  `READ COMMITTED` vs. `REPEATABLE READ`/`SERIALIZABLE`) and the fix pattern (`SELECT ... FOR UPDATE` /
  optimistic `version` column) without wiring either into the production write path.
- Any future use case that needs the same all-or-nothing guarantee across multiple repository writes should
  reuse this same `UnitOfWork` port rather than inventing a parallel mechanism.
