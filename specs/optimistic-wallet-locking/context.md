# Task Context Report — Optimistic locking for concurrent wallet debits

- **Task:** Implement optimistic locking to prevent concurrent wallet debits
- **Issue ID:** none (descriptive slug used)
- **Generated:** 2026-10-10, against `main` @ `800d3e0` (no source changes since that commit)
- **Readiness:** NEEDS CLARIFICATION (see §10)

## 1. Task Summary

Close the documented lost-update gap: two concurrent remittances debiting the same wallet can both succeed,
with the later absolute-balance write silently erasing the earlier one. Use optimistic concurrency control —
writes check the `wallets.version` value that was read and are rejected if another transaction changed the
row first.

## 2. Affected Bounded Contexts

| Context | Why |
|---|---|
| **Wallet** (primary) | `Wallet` entity, `WalletRepository` interface, Postgres and in-memory adapters, `wallets.version` column. |
| **Remittance** | `SendRemittanceUseCase` is the only read–modify–write path for wallet balances; its controller determines the HTTP status of a conflict. |
| **Ledger** (indirect) | Legs are posted in the same transaction *before* wallet saves, so a conflict must roll them back. |
| Not affected | User, Account, Compliance, Exchange — only re-invoked if the chosen policy retries the whole use case. |

## 3. Relevant Documentation

| Document | Relevance |
|---|---|
| [`AGENTS.md`](../../AGENTS.md) | Rules: don't weaken Guaranteed invariants, update `invariants.md` in the same change, no rewrites of applied migrations, keep scope tight. |
| [`docs/context-routing.md`](../../docs/context-routing.md) | Routed to the "Concurrency or idempotency" and "Wallet, ledger, remittance" rows. |
| [`docs/invariants.md`](../../docs/invariants.md) | Records this as a **Known violation** ("Wallet → Concurrent updates — known lost-update gap"); must be updated with the change. |
| [`docs/concurrency-lab.md`](../../docs/concurrency-lab.md) | Reference pattern (`WHERE version = $n`, `rowCount === 0` ⇒ conflict ⇒ re-read and retry); states the production path doesn't use it yet. |
| [`docs/architecture.md`](../../docs/architecture.md) (§`UnitOfWork`, ~line 134) | Only the `UnitOfWork` bullet was checked — it says row locking / concurrent-debit race safety is not implemented. Needs a text update. |

## 4. Relevant Source Files

| File | Role |
|---|---|
| [`src/domain/wallet/entities/wallet.ts`](../../src/domain/wallet/entities/wallet.ts) | Immutable entity; `credit()`/`debit()` return new instances. **No `version` field.** |
| [`src/domain/wallet/repository/wallet-repository.ts`](../../src/domain/wallet/repository/wallet-repository.ts) | `save` / `findById` / `findByAccountIdAndCurrency`. No version concept. |
| [`src/infra/persistence/postgresql/postgres-wallet-repository.ts`](../../src/infra/persistence/postgresql/postgres-wallet-repository.ts) (lines 35–51) | `save()` upserts an **absolute** balance — the lost-update site. SELECTs don't read `version`. |
| [`src/infra/persistence/in-memory/in-memory-wallet-repository.ts`](../../src/infra/persistence/in-memory/in-memory-wallet-repository.ts) | Upsert by id, no version check. Backs `npm test`. |
| [`src/infra/persistence/postgresql/concurrency-lab/wallet-optimistic-repository.ts`](../../src/infra/persistence/postgresql/concurrency-lab/wallet-optimistic-repository.ts) | Reference implementation of the pattern (raw SQL, not domain-aware, not wired anywhere). |
| [`src/infra/persistence/postgresql/migrations/004_add_wallet_version.sql`](../../src/infra/persistence/postgresql/migrations/004_add_wallet_version.sql) | `version INTEGER NOT NULL DEFAULT 0` already exists — **no new migration needed**. Its comment says production doesn't read it. |
| [`src/application/remittance/uses-cases/send-remittance-use-case.ts`](../../src/application/remittance/uses-cases/send-remittance-use-case.ts) | Reads 3–4 wallets, posts legs (line 189), saves wallets (lines 191–196), all inside one `UnitOfWork`. |
| [`src/application/remittance/dto/send-remittance-input.ts`](../../src/application/remittance/dto/send-remittance-input.ts) | Validation; does **not** reject `senderAccountId == recipientAccountId`. |
| [`src/infra/persistence/postgresql/postgres-unit-of-work.ts`](../../src/infra/persistence/postgresql/postgres-unit-of-work.ts) | Real `BEGIN`/`COMMIT`/`ROLLBACK` on one connection; rolls back on any thrown error. |
| [`src/infra/persistence/in-memory/in-memory-unit-of-work.ts`](../../src/infra/persistence/in-memory/in-memory-unit-of-work.ts) | Passthrough — **no rollback**. |
| [`src/infra/factories/remittance-factory.ts`](../../src/infra/factories/remittance-factory.ts) | Wires `postgresRegistry.walletRepository` and `unitOfWork` into the use case. |
| [`src/interfaces/http/controllers/send-remittance.controller.ts`](../../src/interfaces/http/controllers/send-remittance.controller.ts) | Unmapped errors become 500; a conflict error would need an explicit mapping. |
| [`src/domain/shared/errors.ts`](../../src/domain/shared/errors.ts) | No concurrency/conflict error exists. |
| `Wallet` constructor call sites: [`open-wallet-use-case.ts:29`](../../src/application/wallet/uses-cases/open-wallet-use-case.ts), [`postgres-wallet-repository.ts:21`](../../src/infra/persistence/postgresql/postgres-wallet-repository.ts), [`seed-treasury-wallets.ts:26`](../../src/infra/persistence/in-memory/seed-treasury-wallets.ts), [`__tests__/domain/entities/wallet.test.ts:14`](../../__tests__/domain/entities/wallet.test.ts) | All affected if the constructor gains a `version` parameter. |

Existing tests located (not opened in full): `__tests__/application/use-cases/remittance/send-remittance-use-case.test.ts`,
`send-remittance-idempotency.test.ts`, `__tests__/concurrency/optimistic-concurrency.test.ts`.

## 5. Existing Implementation

- `SendRemittanceUseCase` reads wallets under `READ COMMITTED` with no lock, computes new balances in memory,
  and saves absolute values. Atomicity is guaranteed; isolation is not.
- Reusable patterns:
  - `UPDATE … SET version = version + 1 WHERE id = $ AND version = $`; `rowCount === 0` ⇒ conflict (concurrency lab).
  - Repositories obtain their connection via `getExecutor()` (`pg.ts`), so an error thrown inside `UnitOfWork`
    rolls back everything automatically.
  - `IdempotentDecorator` calls `release()` on failure, so a client can retry with the same idempotency key.
- New-wallet creation (`OpenWalletUseCase`) uses the same `save()`. Inserting a new wallet must remain a plain
  insert at `version = 0`; only updates to existing wallets become version-checked.

## 6. Financial and Technical Invariants

| Invariant | Classification |
|---|---|
| Balance never negative (`Wallet.debit()` + DB `CHECK`) | **Guaranteed** — must not be touched. |
| Double-entry balancing via `LedgerService` | **Guaranteed** — a conflict must roll back already-posted legs (it does on Postgres). |
| `UnitOfWork` atomicity | **Guaranteed** on Postgres; **not** in memory (no rollback). |
| Idempotent claim/save/release | **Guaranteed** — a conflict error must take the decorator's `release()` path, not `save()`. |
| No lost updates on concurrent debits | **Known gap** — the target of this task; becomes Guaranteed once implemented and documented. |
| Wallet balance == sum of its ledger entries | **Known gap** (`OpenWalletUseCase` opening balance) — out of scope. |
| Leg currency matches target wallet currency | **Intended** — unaffected. |

## 7. Technical Risks

1. **Treasury wallets are a hotspot.** Every remittance in a currency writes that currency's treasury wallet.
   Version-checking it makes *any* two concurrent same-currency remittances conflict, even between unrelated
   customers — a severe throughput hit. The task says "debits", but the lost update also affects credits and
   treasury writes.
2. **Probable undocumented money-creation bug with self-transfers** (found by reading code; not executed).
   Nothing rejects `sender == recipient` with the same currency. `sourceWallet` and `destinationWallet` are
   then two copies of one row; the destination save (`original + amount`) overwrites the source save
   (`original − amount − fee`), so the wallet balance diverges from the ledger. With version checks this
   request would instead conflict on its own second write. Needs a decision and should be tracked separately,
   not fixed in passing.
3. **Deadlocks.** Saves run source → destination → treasury. Opposite-direction transfers (A→B and B→A) lock
   rows in opposite order and Postgres may abort one with `40P01`. This exists today with upserts; conflict
   handling should cover it as well.
4. **Retry scope.** Retrying the whole `doExecute` re-calls FX (possibly the HTTP provider with its own
   retry/breaker) and compliance, and generates a new `RemittanceId`; bounded retries add latency under load.
5. **In-memory test fidelity.** With no in-memory rollback, a conflict on the second save leaves the first
   save applied, so in-memory tests can pass or fail for reasons that don't match Postgres behavior.
6. **API behavior change.** Without explicit mapping, a conflict returns 500. If 409 is chosen, it must be
   distinguishable from `IdempotencyKeyInFlightError`, which already returns 409.
7. **Constructor change** to `Wallet` ripples to every call site listed in §4, including seed code.

## 8. Missing Information

- **Conflict policy:** bounded internal retry (how many attempts; re-run everything or only the reads?) versus
  returning an error (409/503) for the client to retry.
- **Scope of version checks:** all wallets (see risk 1), customer wallets only, or customer wallets
  version-checked with treasury using an atomic relative update (`balance = balance ± $1`)?
- **Where `version` lives:** on the `Wallet` entity (recommended — explicit and testable, wider constructor
  change) or tracked only inside the repository.
- **Self-transfers:** reject `sender == recipient` with the same currency (validation or use case), before or
  as part of this change?
- **Documentation inconsistencies:**
  - `AGENTS.md` says `db:migrate` applies 001–004, but `005_add_outbox_broker_column.sql` also exists.
  - The migration 004 comment and `concurrency-lab.md` say production doesn't use `version`; both become
    stale. Migration 004 must not be rewritten, so the correction belongs in docs (or a new note).

## 9. Recommended Validation

- `npm test -- wallet` and `npm test -- send-remittance`, plus new unit tests for the in-memory version
  conflict and the controller's conflict mapping.
- `npm run test:concurrency` with a new test running several real `SendRemittanceUseCase` debits against one
  wallet concurrently: final balance must equal start minus successful debits, and ledger entries must agree.
  Requires a local, migrated Postgres.
- `npm run test:integration` — the Postgres write path for `POST /remittances` changes.
- `npm run lint` and `npm run format:check`.
- Docs updated in the same change: `docs/invariants.md` (wallet lost-update entry), `docs/architecture.md`
  (`UnitOfWork` bullet), `docs/concurrency-lab.md`.

## 10. Context Readiness

**NEEDS CLARIFICATION.** The mechanism is understood and largely in place (the column exists; the lab shows the
pattern). Two decisions change both the design and the API and belong to the user: the conflict policy
(retry vs. error) and treasury-wallet handling. The self-transfer issue (risk 2) appears to be a real,
undocumented bug that likely warrants its own issue regardless of these choices.
