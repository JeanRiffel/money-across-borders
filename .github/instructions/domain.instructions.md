---
applyTo: "src/domain/**,src/application/**"
---

Domain and application code — see [AGENTS.md](../../AGENTS.md) and
[docs/architecture.md](../../docs/architecture.md) for full context.

- **Dependencies point inward.** `src/domain/**` must not import from `src/infra/**`,
  `src/interfaces/**`, or `src/main/**` — it depends only on its own port interfaces (repositories,
  services) and other domain code. `src/application/**` may depend on `src/domain/**` and its own port
  interfaces (e.g. `UnitOfWork`, `EventPublisher`, `IdempotencyRepository`), never on a concrete `infra`
  adapter directly.
- **Business invariants belong here, not in a repository or controller.** Balance checks
  (`Wallet.debit()`), currency checks (`Wallet.credit()`/`.debit()`'s `assertSameCurrency`), double-entry
  balancing (`LedgerService.postBalancedEntries`) all live in domain entities/services — see
  [docs/invariants.md](../../docs/invariants.md) for the full list of what's guaranteed where. A
  `Postgres*Repository` should never contain a business rule; it maps rows to/from entities and nothing
  more.
- **Don't bypass a use case without a deliberate, stated architectural reason.** Controllers call use cases,
  not repositories directly; a new financial action (anything touching wallets/ledger/remittances) is a new
  or extended use case, following the existing `UseCase<Input, Output>` shape
  (`application/shared/idempotency/common-use-case..ts` — the trailing dot in that filename is intentional,
  not a typo to fix in isolation).
- **Entities are immutable-style** — private fields, `get*()` accessors, no setters; a mutation
  (`Wallet.credit()`/`.debit()`) returns a new instance. **Money** is always an integer minor-units count
  (`Money.fromMinorUnits`), never a float; direction is `EntryDirection`, never a signed amount. IDs/enums
  are value objects with private constructors and static factories, not raw strings/numbers.
- **If a use case touches more than one repository's worth of state that must commit or roll back
  together** (see `SendRemittanceUseCase`), wrap it in `UnitOfWork.runInTransaction()` rather than relying on
  the caller to sequence writes carefully — see ADR [0007](../../docs/adr/0007-unit-of-work-transaction-boundary.md).
- Check [docs/invariants.md](../../docs/invariants.md) before changing anything under `ledger/`, `wallet/`,
  or `remittance/` — several real gaps are already documented there (no row locking on concurrent wallet
  writes, `OpenWalletUseCase` accepting an unbacked initial balance); know which invariant you're near before
  changing the code around it.
