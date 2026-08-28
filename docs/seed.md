# Seed dataset

`npm run seed` (`src/infra/seed/`) generates a deterministic, financially-coherent dataset — customers,
KYC profiles, wallets, ledger-backed balances, and remittances in every status the schema supports —
directly against Postgres, for functional tests, concurrency tests, load tests, and resilience experiments.
It is standalone infrastructure tooling, the same idiom as `migrations/run-migrations.ts` and the
`worker:*` scripts: it connects to the same `POSTGRES_*` Postgres the app uses, does its work, and exits.
No use case, controller, or existing behavior is touched by it.

## Running it

```bash
npm run seed -- --customers 100 --seed 42
npm run seed -- --customers 10000 --seed 42
npm run seed -- --customers 1000 --scenario high-contention --seed 42
npm run seed -- --help
```

Requires a reachable, **migrated** Postgres (`npm run db:migrate` first) with no business data in it yet —
see "Determinism and a clean database" below.

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--customers <n>` | 10000 (500 for `high-contention`) | Number of customers — 1 `User` + 1 `Account` each. |
| `--seed <n>` | 42 | Integer PRNG seed. Same seed + same options → same dataset on a clean database. |
| `--scenario <name>` | `normal` | `normal` or `high-contention` — see below. |
| `--date-range-days <n>` | 90 | How many days back remittances/signups may be dated from "now". |
| `--wallets <n>` | — | Approximate total wallet count; scales the configured wallets-per-customer range. |
| `--remittances <n>` | — | Approximate total remittance count; scales the per-activity-profile ranges. |
| `--reset` | off | Truncates business tables and re-seeds the treasury first. Refused when `NODE_ENV=production`. |

`--wallets`/`--remittances` are **targets**, not exact counts: wallet/remittance volume is fundamentally
driven by per-customer distributions (how many currencies a customer holds, how many remittances an
activity profile sends), same as every other number in this dataset — these two flags scale those
distributions proportionally toward the requested total rather than pinning it exactly.

## What gets generated, and how

Everything is generated **in memory first** (`generate-dataset.ts`, pure — no I/O, fully unit tested), then
written to Postgres in one transaction (`persistence/seed-database.ts`), then independently re-verified by
querying Postgres itself (`validation/`). Generation order, matching FK dependency order:

1. **Customers** (`generators/customer-generator.ts`) — 1 `User` + 1 `Account` each, matching what
   `CreateAccountUseCase` provisions per signup. Each gets an activity profile (`heavy` 5% / `normal` 70% /
   `low` 25%) that later drives how many remittances it sends.
2. **KYC profiles** (`generators/kyc-generator.ts`) — one per customer, 80% `VERIFIED` / 10% `PENDING` / 10%
   `REJECTED`.
3. **Wallets** (`generators/wallet-generator.ts`) — 1–3 distinct currencies per customer, drawn from BRL
   (55%) / USD (30%) / EUR (15%) by default (GBP is supported and treasury-funded too, but stays at weight 0
   unless you opt in — see `config/seed-config.ts`). Balances start at 0 here.
4. **Funding** (`generators/funding-generator.ts`) — every wallet's opening balance is posted as a real,
   ledger-backed transaction *against the treasury wallet of the same currency* (debit treasury, credit
   customer wallet) — the same treasury-as-counterparty pattern `LedgerService`/`SendRemittanceUseCase`
   already use for FX, applied here to "funding" instead of "conversion". Balances fall into configurable
   tiers (zero 10%, low/medium/high 40/35/15%). See "Why funding goes through treasury" below for why this
   is a deliberate seed-only choice, not a mirror of the app's own `OpenWalletUseCase` behavior.
5. **Remittances** (`generators/remittance-generator.ts`) — sized per customer by activity profile.
   `COMPLETED` remittances replay `SendRemittanceUseCase`'s exact leg layout (same-currency principal moves
   wallet-to-wallet with only the fee through treasury; cross-currency principal routes both legs through
   treasury), using the real `FlatPercentageFeeCalculator` and `MockExchangeRateProvider` — with a small
   deterministic jitter (±0.5% by default) applied on top of the provider's quoted rate so not every
   BRL→USD transfer uses the identical rate. `REJECTED_COMPLIANCE` / `REJECTED_INSUFFICIENT_FUNDS` /
   `FAILED` rows are inserted directly, with **no ledger legs** — see "Statuses the app never actually
   persists" below.
6. **Idempotency demo rows** — ~1% of completed remittances also get a row in `idempotency_records` (see
   "Idempotency" below).
7. *(`high-contention` scenario only)* a small shared account/wallet pool plus a JSON file of candidate
   concurrent requests — see "high-contention scenario" below.

## Determinism and a clean database

The whole pipeline is a pure function of `(seed, config, treasury's starting balances)` — entity ids are
generated from the seeded PRNG (`rng/deterministic-rng.ts`'s `uuid()`), not `crypto`-backed `uuidv7()`, so
two runs with the same seed and options against a freshly migrated database produce the same dataset. This
is verified directly (no database needed) in `__tests__/infra/seed/unit/generate-dataset.test.ts`. The one
field that is **not** byte-identical across two runs is `users.password_hash`: `BcryptPasswordHasher` salts
with real randomness (as any correct password hasher should), so the hash string itself differs every run
even though it is always a valid bcrypt hash of the same fixed seed password (`Seed@12345!`) — verify it
with `bcrypt.compare`, not string equality, same as the determinism test does.

The seed expects to run against an **empty** database (only the treasury account/wallets from
`migrations/002_seed_treasury_wallets.sql`) — it refuses to run otherwise (`DatabaseNotCleanError`) unless
`--reset` is passed, which truncates every business table and re-seeds the treasury before generating.
`--reset` is refused when `NODE_ENV=production`. Determinism is about *(seed, config) → dataset*, not about
being safely re-runnable on top of already-seeded data — running twice without `--reset` in between isn't a
supported combination.

## Why funding goes through treasury

`OpenWalletUseCase`'s `initialBalanceMinorUnits` parameter sets `wallets.balance_minor_units` directly, with
**no corresponding `LedgerEntry`** — a documented, deliberate MVP simplification ("no funding/deposit rail
exists in this MVP", see that file). Mirroring that gap in the seed would make "wallet balance consistent
with ledger" false for a chunk of the dataset by construction. Instead, every customer wallet's opening
balance here is a real posting against the treasury wallet of the same currency, so **100% of every customer
wallet's balance in this dataset is reachable by summing its `ledger_entries`** — this is checked directly
against Postgres after every run (`validation/financial-invariants.ts`'s "Wallet balances consistent with
ledger" line). The one exception is the treasury wallets themselves: their *starting* balance comes from
`migrations/002_seed_treasury_wallets.sql`'s own direct `INSERT` (predating any seed run, with no
`LedgerEntry` of its own — the same kind of gap as `OpenWalletUseCase`'s, just already true before this seed
exists and out of scope for it to fix without touching that migration). That check excludes the treasury
account for exactly this reason; treasury's health is validated separately via "Treasury liquidity
sufficient" (never negative) instead.

Because treasury is seeded once with a large but *fixed* balance (`migrations/002_seed_treasury_wallets.sql`,
documented as deliberate in `docs/known-issues.md`) and funding has to share that fixed pool with every
remittance's FX legs generated afterward, funding amounts are sampled from the configured tiers and then
**scaled down together** if their sum would exceed a safety fraction of that currency's treasury balance —
see `generators/funding-generator.ts`. This means a `--customers 100000` run against the same fixed treasury
pool gets proportionally smaller average balances than a `--customers 100` run; the seed never lets treasury
or any wallet go negative to hit a configured average.

## Statuses the app never actually persists

Two gaps between what this repo's use cases do and what the requested dataset needs, both handled the same
way — insert the row directly, with no side effects the real code wouldn't have produced either:

- **Remittance failures**: `RemittanceStatus` has `REJECTED_COMPLIANCE` / `REJECTED_INSUFFICIENT_FUNDS` /
  `FAILED` ids, but `SendRemittanceUseCase` throws (`ComplianceRejectedError`, `InsufficientFundsError`,
  `WalletNotFoundError`) **before ever constructing a `Remittance`** — none of the three is ever actually
  written to Postgres by the real HTTP flow today. This seed inserts them directly, with no `LedgerEntry`
  and no wallet mutation, which is exactly what a real failed attempt leaves behind today: no accounting
  trace at all.
- **KYC / Account statuses**: `SubmitKycUseCase` always auto-verifies synchronously — it never produces
  `PENDING` or `REJECTED`. `CreateAccountUseCase` always persists `AccountStatus.OPEN`. The seed's KYC
  distribution (`PENDING`/`REJECTED` included) and any non-`OPEN` account are likewise inserted directly.

If you need the dataset to match the live HTTP flow byte-for-byte instead, set
`remittanceStatusDistribution` to 100% `completed` and `kycDistribution` to 100% `verified` in
`config/seed-config.ts` (or ask for a `--strict-mvp` flag to be added — not implemented today).

## Idempotency

`idempotency_records` exists in the schema but isn't wired to any factory today — Redis
(`RedisIdempotencyRepository`) is the real, load-bearing idempotency store (see AGENTS.md's Idempotency
bullet). Populating Redis isn't part of "the same seed on a clean database produces the same dataset" (Redis
is ephemeral, not "the database" this tool targets), so by default the seed only demonstrates idempotency at
the data level: ~1% of completed remittances (`idempotencyDemoRatio`) also get a row in `idempotency_records`
keyed `seed-demo:<remittanceId>`, mirroring what `IdempotentDecorator` would have cached had that remittance
been submitted twice with the same `Idempotency-Key`. These rows are inert in production — nothing reads
them — they exist as fixture data for a test that exercises `PostgresIdempotencyRepository` directly.

## `high-contention` scenario

Prepares a dataset for *later* concurrency tests (optimistic/pessimistic locking, `SELECT FOR UPDATE`,
`SERIALIZABLE`, transaction retries) — it does **not** run anything concurrently itself.
`generators/contention-generator.ts` does two things:

1. Tops up a small pool of accounts/wallets (`contentionSharedAccounts`, default 10) well beyond what any
   single generated remittance needs, using the same treasury-backed, ledger-first posting funding uses for
   every other wallet.
2. Writes `contentionIntents` (default 2000) candidate request tuples — sender/recipient account+currency
   and an amount, all referencing *only* that shared pool — to `seed-output/high-contention-requests.json`.

Fire those concurrently against a **running app** with an external load-test tool (k6, artillery, a bespoke
script) to actually exercise locking/retry behavior; the seed process itself never executes them.

## Performance

Everything is generated in memory, then written via `INSERT ... SELECT * FROM UNNEST(...)`
(`persistence/batch-writer.ts`) in batches of 5,000 rows — one round trip per batch instead of one per row,
without adding `pg-copy-streams` as a new dependency (`pg` already binds a JS array to a typed Postgres
array parameter, which is all `UNNEST` needs). The whole write happens in a single transaction — same
all-or-nothing guarantee `PostgresUnitOfWork` gives a single use case, applied here across the whole run: a
failure on the very last batch rolls back everything inserted before it.

## Segurança

Every name/email/document is obviously fictitious (`rng/fixtures/names.ts`; emails use the RFC 2606
`.test` TLD). Every seeded user shares one fixed, obviously-fake password (`Seed@12345!`), hashed **once**
with the real `BcryptPasswordHasher` and reused — hashing a distinct password per customer at bcrypt's real
cost factor doesn't scale to 10k+ rows, and the resulting hash is still a real, verifiable bcrypt hash of a
known password, not a shortcut around the hashing mechanism itself.

## Validation

After every write, `validation/referential-invariants.ts` and `validation/financial-invariants.ts`
independently re-query Postgres (not the generators' own in-memory bookkeeping) and check:

- Foreign keys valid (wallets→accounts, ledger_entries→wallets, kyc_profiles→accounts, remittances→
  sender/recipient accounts and source/destination wallets)
- Debits == credits, globally, per currency
- Every posting balances per currency (the same rule `LedgerService.postBalancedEntries` enforces, applied
  per `(transaction_id, currency)`)
- Wallet balances consistent with ledger (every non-treasury wallet — see "Why funding goes through
  treasury" above for why treasury itself is excluded from this specific check)
- No invalid negative balances
- Treasury liquidity sufficient (never negative)

A failing check makes the whole run exit non-zero, with the failing line(s) printed — see
`validation/report.ts` for the exact output shape.

## Testes

- `__tests__/infra/seed/unit/**` — no database required, part of `npm test`: RNG determinism, config
  resolution/validation, the ledger-balance assertion, and `generate-dataset.test.ts`'s full-pipeline
  determinism/FK/ledger/wallet/treasury/high-contention checks (run entirely in memory against a fake
  treasury snapshot).
- `__tests__/infra/seed/integration/**` — needs a real, migrated Postgres, run via `npm run test:seed`
  (`jest.seed.config.ts`), same requirement as `npm run test:integration`: a small end-to-end dataset (100
  customers / ~500 remittances) validated against every check above, the `--reset`/clean-database guard, the
  `high-contention` scenario written for real, and a deliberately-corrupted wallet balance proving the
  validators actually fail when an invariant is violated.

## Limitações conhecidas

- Remittance/KYC/account statuses the real use cases never persist are inserted directly (see "Statuses the
  app never actually persists"). This is the seed intentionally covering more ground than the live app does
  today, not a bug — but it means a handful of seeded rows have no HTTP-reachable equivalent to replay.
- Redis isn't populated by default (see "Idempotency"); pass a future `--with-redis-idempotency` flag if you
  need a live replay test against a running app (not implemented today).
- Recipients are always other seeded customers (P2P within the platform, matching this domain's shape) —
  there's no "external recipient" concept to seed.
- `--wallets`/`--remittances` scale distributions proportionally; they are not exact counts (see "Running
  it" above).
- The seed assumes a single Postgres instance and generates everything for one run in one process — it does
  not shard or parallelize generation across workers.
