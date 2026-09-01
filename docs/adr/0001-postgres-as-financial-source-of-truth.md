# 0001 — PostgreSQL as the financial source of truth

## Status

Accepted

## Context

The account/wallet/ledger/remittance/KYC write path needs strong consistency: balances must never go
negative, a remittance's wallet debits/credits and ledger legs must commit or roll back together, and two
concurrent requests for the same resource must not both succeed. The project also wants to demonstrate ACID
transactions and real locking/isolation behavior as part of its architecture-showcase goal (see
[docs/concurrency-lab.md](../concurrency-lab.md)), not just describe them.

## Decision

PostgreSQL is the system of record for `users`, `accounts`, `wallets`, `ledger_entries`, `remittances`, and
`kyc_profiles`. Every `*-factory.ts` wires its use cases to `Postgres*Repository` adapters
(`src/infra/persistence/postgresql/`) via `postgres-registry.ts`. `server.ts` fails fast
(`process.exit(1)`) if Postgres isn't reachable at boot — it's treated as load-bearing, not optional
infrastructure. Schema changes go through hand-written, numbered SQL files in `migrations/`, run by
`npm run db:migrate` — no ORM, no query builder, no auto-migration.

## Alternatives considered

- **Keep the in-memory repositories as the only implementation.** Rejected for anything beyond `npm test`:
  in-memory state can't survive a process restart, can't be queried by a second process (a worker), and
  can't demonstrate real locking/isolation-level behavior, which is an explicit goal of this project.
- **MongoDB as primary store.** Rejected for the ledger/wallet write path — this data is inherently
  relational (foreign keys between accounts/wallets/ledger entries/remittances) and needs multi-row ACID
  transactions; Mongo is used elsewhere in this codebase (`MongoKycDossierRepository`, an unstructured
  document archive) where that trade-off fits better.
- **An ORM (e.g. Prisma, TypeORM).** Rejected to keep the SQL — and its transaction/locking behavior —
  directly visible and directly testable (see `docs/concurrency-lab.md`'s "No ORM" constraint), and to avoid
  an abstraction layer between the Clean Architecture ports and the actual persistence mechanics this project
  is trying to demonstrate.

## Consequences

- The app requires a real, migrated Postgres to run at all outside `npm test` — there is no "just run it"
  path without infrastructure (`npm run db:migrate` first, every time, on a fresh database).
- `npm test`'s use-case suite intentionally bypasses this entirely, constructing `InMemory*` repositories
  directly — fast, no external dependency, but it does not exercise real transaction/locking/constraint
  behavior. That's what `npm run test:integration` (Cucumber) and `npm run test:concurrency` are for.
- Migrations are additive and hand-reviewed SQL, not generated — see the CHECK constraints backing
  [docs/invariants.md](../invariants.md)'s wallet-balance and ledger-amount guarantees.
- The known gap this doesn't solve: transaction atomicity (`UnitOfWork`) does not by itself give
  concurrent-write isolation on the same wallet row — see [0007](0007-unit-of-work-transaction-boundary.md)
  and the "Wallet" section of [docs/invariants.md](../invariants.md).
