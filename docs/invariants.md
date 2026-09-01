# Invariants

This is the source of truth for what this financial system actually guarantees today, as opposed to what
it's designed to eventually guarantee. Every claim below was checked against the current implementation
(see the file paths cited); nothing here is aspirational unless explicitly labeled **Intended**.

Each invariant is tagged:

- **Guaranteed** — enforced today, in code and/or by a database constraint. Breaking it requires bypassing
  an existing check, not just "forgetting" something.
- **Intended** — the design assumes this holds, and every current call site respects it, but nothing
  actively prevents a new call site from violating it.
- **Known violation / gap** — a real, current way to break the property described. Not a hypothetical.

Before changing code that touches money, wallets, ledger entries, remittances, or idempotency, check
whether your change affects one of these. If you weaken a **Guaranteed** invariant, say so explicitly in
the PR/commit description — don't let it happen silently.

## Money and currency

- **Money is always an integer count of minor units, never a float.** `Money.fromMinorUnits`
  (`src/domain/shared/value-objects/money-value-object.ts`) is the only constructor path. **Guaranteed** by
  the type itself for any code going through it.
- **Currency is validated against a static registry** (`Currency.from`,
  `src/domain/shared/value-objects/currency-value-object.ts`); an unsupported code throws
  `UnsupportedCurrencyError`. **Guaranteed**.
- **Direction (debit/credit) is a separate value (`EntryDirection`), never expressed via a signed amount.**
  Amount columns are `CHECK (amount_minor_units >= 0)` / `CHECK (balance_minor_units >= 0)` at the DB level
  (`migrations/001_init_schema.sql`). **Guaranteed**.

## Ledger

- **Double-entry / per-currency balance**: `LedgerService.postBalancedEntries()`
  (`src/domain/ledger/services/ledger-service.ts`) refuses to post a set of legs unless every currency
  present nets to exactly zero (`assertBalancedPerCurrency`), throwing `UnbalancedLedgerError` otherwise.
  **Guaranteed** for any code that posts through `LedgerService`. **Intended, not enforced**, for the
  system as a whole: nothing stops a future call site from calling
  `LedgerRepository.saveMany()` directly, bypassing the balance check — there is no DB-level constraint
  (e.g. a trigger summing `ledger_entries` per `transaction_id`) backing this up. Today, `LedgerService` is
  the only thing that calls `saveMany()`.
- **Immutability**: `LedgerRepository` (`src/domain/ledger/repository/ledger-repository.ts`) exposes no
  update or delete method, and `PostgresLedgerRepository.saveMany()`
  (`src/infra/persistence/postgresql/postgres-ledger-repository.ts`) is a plain multi-row `INSERT`, never an
  upsert. **Guaranteed** at the application-code level (there is no code path to mutate a posted entry).
  **Known gap**: there is no DB-level protection (no `REVOKE UPDATE/DELETE`, no trigger) against a manual
  `UPDATE`/`DELETE` against `ledger_entries` — immutability is a convention the app's own code respects, not
  something Postgres itself refuses.
- **Currency consistency per entry**: each `LedgerEntry` carries its own `Money` (amount + currency); legs
  posted for a wallet always use that wallet's currency (see `SendRemittanceUseCase`'s leg construction).
  **Intended**: nothing at the DB or domain-service level cross-checks that a leg's currency matches the
  `wallets.currency` of the `wallet_id` it's posted against — `LedgerService` only validates balance
  *within* a posting, not against the target wallet's own currency.
- **A posting groups its legs by `transaction_id`** (a remittance id today), letting
  `findByTransactionId()` reconstruct one posting's full leg set. **Guaranteed** by how `SendRemittanceUseCase`
  builds `legs` and calls `postBalancedEntries` once per remittance.

## Wallet

- **Balance never goes negative**: `wallets.balance_minor_units` has `CHECK (balance_minor_units >= 0)`
  (`001_init_schema.sql`) — the backstop. Above that, `Wallet.debit()`
  (`src/domain/wallet/entities/wallet.ts`) throws `InsufficientFundsError` *before* anything is persisted if
  `amount > balance`. **Guaranteed** in two independent layers (domain check, then DB check as backstop).
- **One wallet per (account, currency)**: `UNIQUE (account_id, currency)` (`001_init_schema.sql`). The
  application does a find-then-insert check first (`OpenWalletUseCase`), but the real guarantee under
  concurrency is the DB constraint — `OpenWalletController` explicitly catches Postgres' `23505`
  unique-violation and maps it to the same 409 the pre-check path returns, because two concurrent requests
  for the same `(account, currency)` can both pass the pre-check before either `INSERT` lands. **Guaranteed**
  by the DB constraint; the app-level pre-check alone would not be.
- **Wallet currency is fixed at creation and enforced on every mutation**: `Wallet.credit()`/`.debit()` call
  `assertSameCurrency()`, throwing `CurrencyMismatchError` on mismatch. **Guaranteed**.
- **Concurrent updates — known lost-update gap**: `PostgresWalletRepository.save()`
  (`src/infra/persistence/postgresql/postgres-wallet-repository.ts`) is an upsert that writes an *absolute*
  `balance_minor_units` value (`ON CONFLICT (id) DO UPDATE SET balance_minor_units = EXCLUDED...`), not a
  relative `balance = balance - $1`. `SendRemittanceUseCase` reads a wallet, computes a new `Wallet` in
  memory, and writes it back — all inside a `UnitOfWork` transaction (atomicity of the *whole remittance*
  write set is guaranteed), but the wallet **read** takes no row lock (`SELECT ... FOR UPDATE`) and no
  version/optimistic check is applied on the **write**. Two concurrent remittances debiting the same wallet
  can both read the same starting balance under Postgres' default `READ COMMITTED` isolation, both compute a
  balance that looks valid from their own read, and the second `save()` to commit silently overwrites the
  first's effect — a classic lost update, not merely a slow one. **Known violation**: this is real today, not
  hypothetical — reproduced deliberately in `docs/concurrency-lab.md` ("Isolation Level" section) and called
  out in `docs/architecture.md`'s `UnitOfWork` bullet ("Not implemented: `SELECT ... FOR UPDATE` row locking
  ... atomicity is guaranteed, but not concurrent-debit race safety"). `migrations/004_add_wallet_version.sql`
  adds a `wallets.version` column, and `WalletOptimisticRepository`
  (`src/infra/persistence/postgresql/concurrency-lab/`) demonstrates the fix pattern (`WHERE version = $n`) —
  but neither is wired into `PostgresWalletRepository` or any `*-factory.ts`; the production write path does
  not use it. The `CHECK (balance_minor_units >= 0)` constraint still prevents the *result* from going
  negative, but does not prevent one debit's effect from being silently lost.
- **Wallet state vs. ledger state — known drift gap**: the design intent is that a wallet's balance is
  always reconstructible as the sum of its ledger entries (double-entry bookkeeping). `SendRemittanceUseCase`
  respects this (every wallet mutation it makes has matching ledger legs posted in the same transaction).
  `OpenWalletUseCase` (`src/application/wallet/uses-cases/open-wallet-use-case.ts`) does **not**: it accepts
  a caller-supplied `initialBalanceMinorUnits` (default `0`, but not restricted to `0`) and persists a
  wallet at that balance **without posting any matching ledger entries** — the DTO's own comment calls this
  "a deliberate stand-in for 'money already in this wallet'" in the absence of a real funding/deposit rail.
  **Known violation**: a wallet opened via `POST /wallets` with a nonzero `initialBalanceMinorUnits` has a
  balance with no corresponding ledger postings, so `sum(ledger_entries for wallet) == wallet.balance` does
  not hold for it. Contrast with `npm run seed`'s funding generator
  (`src/infra/seed/generators/funding-generator.ts`), which deliberately posts opening balances as real
  treasury-backed ledger transactions specifically to avoid this gap in seeded data — see
  [seed.md](seed.md).

## Remittance

- **Valid state transitions, as actually reachable**: `RemittanceStatus`
  (`src/domain/remittance/value-objects/remittance-status-value-object.ts`) defines four terminal states
  (`COMPLETED`, `REJECTED_COMPLIANCE`, `REJECTED_INSUFFICIENT_FUNDS`, `FAILED`) plus a reserved-but-unused
  `PENDING` slot ("reserved for a future async settlement rail"). In the real code path,
  `SendRemittanceUseCase` only ever constructs and persists a `Remittance` in the `COMPLETED` state — every
  rejection path (`InsufficientFundsError` from `Wallet.debit()`, `ComplianceRejectedError` from the
  compliance check) throws *before* a `Remittance` entity is ever created, so no row is written for a failed
  attempt today. **Guaranteed**: only `COMPLETED` remittances exist in `remittances` via the live HTTP flow.
  The other three statuses are reachable only through `npm run seed`, which inserts them directly with no
  ledger legs, as a documented simplification for exercising search/read paths — see
  [seed.md](seed.md) "Statuses the app never actually persists." `RemittanceRepository` has no `update()`
  method — a remittance, once saved, is never mutated. **Guaranteed** (write-once).
- **Debit/credit consistency**: every remittance debits the sender's source wallet for `amount + fee` in one
  call (`sourceWallet.debit(amount.add(fee))`) and credits the recipient's destination wallet for the
  converted amount, with matching ledger legs posted in the same `LedgerService.postBalancedEntries()` call
  — see leg layouts in `SendRemittanceUseCase.doExecute()`. **Guaranteed** by the single code path that
  creates remittances.
- **Cross-currency behavior / treasury balancing**: a single ledger posting cannot balance directly across
  two currencies (double-entry requires each currency to net to zero on its own — see "Ledger" above), so a
  cross-currency remittance routes both legs through system-owned, per-currency **treasury wallets**
  (`domain/wallet/treasury-account.ts`, `TREASURY_ACCOUNT_ID`, seeded by `migrations/002_seed_treasury_wallets.sql`):
  the source currency leg settles against the source-currency treasury wallet, the destination currency leg
  against the destination-currency treasury wallet. A same-currency remittance skips treasury for the
  principal (wallet-to-wallet directly) and routes only the fee through it. **Guaranteed** by
  `LedgerService`'s per-currency-zero-sum check, which would reject any leg layout that didn't balance this
  way. **Intended, not actively rebalanced**: treasury wallets are seeded once with a large fixed balance
  (`1,000,000,000` minor units per currency) rather than continuously topped up from an external FX
  counterparty — a treasury wallet could theoretically be drained by enough cross-currency volume in one
  direction; nothing in the app monitors or alerts on treasury balance today. See
  [known-issues.md](known-issues.md).
- **FX rate is not normalized into the compliance check**: `InMemoryComplianceChecker`
  (`src/infra/compliance/in-memory-compliance-checker.ts`) compares the *source*-currency raw minor-units
  amount against a fixed threshold (`UNVERIFIED_LIMIT_MINOR_UNITS = 100_000`), regardless of currency — a
  documented, deliberate MVP simplification (see the file's own comment), not a bug, but worth knowing if
  you're reasoning about compliance behavior across currencies with very different unit values.
- **Idempotency of the send-remittance HTTP action**: see "Idempotency" below — the guarantee is about the
  *use case invocation*, not a domain-level "this remittance was already settled" check within
  `SendRemittanceUseCase` itself (it does not, for example, cross-check the sender/recipient/amount against
  a recent remittance to detect an accidental duplicate submitted *without* an idempotency key).

## Idempotency

Backs `account` (`POST /account`), `wallet` (`POST /wallets`), `remittance` (`POST /remittances`), and `kyc`
(`POST /kyc`) — see the `Idempotency` bullet in [architecture.md](architecture.md) for the full mechanism
(`IdempotentDecorator`, `RedisIdempotencyRepository`, the `claim()`/`save()`/`release()` contract, and the
Postgres-native equivalent demonstrated in `docs/concurrency-lab.md`).

- **Repeated requests with the same key don't produce duplicate financial effects**: `claim()` is an atomic
  reservation (`SET key IN_FLIGHT NX EX 30s` on Redis; `INSERT ... ON CONFLICT (key) DO NOTHING` on the
  Postgres adapter) — of N concurrent requests sharing a key, exactly one proceeds to execute the wrapped use
  case; the rest either replay the first one's saved response (if it finished) or get
  `IdempotencyKeyInFlightError` (if it's still running). **Guaranteed**, and specifically guaranteed *against
  the race*, not just against sequential retries — this was a real, since-fixed bug (see
  [known-issues.md](known-issues.md)). `IdempotentDecorator`'s own replay/in-flight/release semantics are
  covered directly in `__tests__/application/shared/idempotency/idempotent-decorator.test.ts`; the guarantee
  applied specifically to remittance creation (retry returns the same result without a second debit, and N
  concurrent `POST /remittances` calls sharing a key settle exactly once) is covered in
  `__tests__/application/use-cases/remittance/send-remittance-idempotency.test.ts`.
- **A caller-supplied key is required to get this guarantee.** Controllers fall back to a freshly generated
  UUID per request when no `Idempotency-Key` header (or body field) is present (see the `IdempotentDecorator`
  bullet in [architecture.md](architecture.md)) — a keyless retry is treated as a brand-new request and *will*
  re-execute the use case. **Intended**: this is "idempotency when the caller asks for it," not automatic
  duplicate detection.
- **Crash-between-claim-and-response is fail-closed, not fail-open**: if the process crashes after `claim()`
  succeeds but before `save()`/`release()` runs, the reservation is never released. A later retry with the
  same key sees `IdempotencyKeyInFlightError` forever (until the Redis key's 30s in-flight TTL expires) rather
  than silently re-executing and risking a double-spend. **Guaranteed** by design — the deliberate trade-off
  documented directly in `IdempotentDecorator`'s comment.
- **Idempotency records themselves are not part of the same DB transaction as the financial write**: Redis
  (idempotency) and Postgres (wallets/ledger/remittances) are two different systems with no cross-system
  transaction. A response could theoretically be saved to Redis after the Postgres transaction commits but
  before the process confirms that write — **not currently a demonstrated gap** (no known failure mode
  reported), but worth naming as an **Intended-not-formally-guaranteed** boundary: the correctness of the
  financial write itself never depends on Redis being reachable *during* `SendRemittanceUseCase.doExecute()`
  (`UnitOfWork` only wraps the Postgres writes), only the *idempotency replay* behavior does.

## Transactional consistency

- **`UnitOfWork`** (`application/shared/transaction/unit-of-work.ts`): `SendRemittanceUseCase` is the one
  consumer — its entire `execute()` body (wallet reads, `LedgerService.postBalancedEntries()`, wallet saves,
  the `Remittance` save) runs inside `unitOfWork.runInTransaction()`.
  `PostgresUnitOfWork.runInTransaction()` (`infra/persistence/postgresql/postgres-unit-of-work.ts`) does a
  real `BEGIN`/`COMMIT`/`ROLLBACK` on one checked-out connection, publishing it via `AsyncLocalStorage` so
  every `Postgres*Repository` call made inside the callback transparently participates — no `client`
  parameter threading. **Guaranteed**: a thrown error at any point in `doExecute()` rolls back every write
  made so far in that call (wallets, ledger legs, the remittance row) — there is no partially-posted
  remittance state reachable via the live HTTP flow. **Known limitation** (see "Wallet" above): the
  transaction guarantees *atomicity* (all-or-nothing), not *isolation* from a concurrent transaction touching
  the same wallet row — no row lock is taken on the wallet reads inside it.
- **Transactional Outbox** (`application/shared/events/outbox-repository.ts`,
  `migrations/003_create_outbox_events.sql`): `CreateAccountUseCase` writes its `account.created` event to
  `outbox_events` *inside* the same `UnitOfWork` transaction as the `User`/`Account` saves, instead of
  publishing to RabbitMQ directly — so the event's durability is exactly as strong as the signup row's; there
  is no window where one exists without the other. **Guaranteed** for `account.created`. A separate relay
  process (`npm run worker:outbox-relay`) is the only thing that actually publishes these rows to RabbitMQ,
  polling for unpublished rows and leaving a failed publish attempt for the next poll (no separate
  retry/backoff bookkeeping beyond "try again next interval"). **Not used** for `remittance.completed` —
  `SendRemittanceUseCase` publishes that one directly to Kafka via `EventPublisher`, *after* its transaction
  commits, on purpose (so a rolled-back remittance can never have already announced itself as completed).
  `EventPublisher`'s contract is "must not throw" — a lost `remittance.completed` publish is an accepted,
  best-effort gap (it only affects the Elasticsearch search index, never the ledger/wallet/remittance source
  of truth in Postgres). See the `EventPublisher` bullet in [architecture.md](architecture.md) for the full
  reasoning on why these two events get different delivery guarantees.
- **Ordering**: within one `UnitOfWork` transaction, statements run in the order the code issues them, and
  Postgres' own MVCC/locking rules apply to each individual statement — there is no additional
  application-level ordering guarantee beyond "everything in this transaction commits together, in the order
  written." Across *different* remittances (different transactions), there is no ordering guarantee at all —
  concurrent remittances against different wallets are fully independent, and concurrent remittances against
  the *same* wallet are the lost-update gap described in "Wallet" above, not an ordering problem this
  transaction boundary solves.

## What this document does not cover

Authentication/authorization is deliberately out of scope here (it's not a financial-consistency invariant
in the double-entry sense) but is directly relevant to *who can trigger* a financial effect — see the
`authMiddleware` gap called out in [AGENTS.md](../AGENTS.md) and `known-issues.md` (a valid JWT for any user
currently authorizes wallet/remittance calls for *any* `accountId` in the request body, not just the token
holder's own). Treat that as a standing constraint when touching `/wallets` or `/remittances`: don't build on
top of it as if per-resource authorization already existed.
