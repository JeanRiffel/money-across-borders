# Concurrency Lab

An educational laboratory answering, with real PostgreSQL behavior instead of guesses: **what exactly
does Postgres do when two transactions touch the same row at the same time?** It targets this app's real
`wallets` and `idempotency_records` tables directly with raw `pg` — no ORM, no query builder — kept in its
own code path so nothing about the production `SendRemittanceUseCase` / `PostgresWalletRepository` flow
changes. See the "No ORM" / "SQL First" constraints this was built under for the full brief.

## Why these tables

`wallets.balance_minor_units` is the one column in this app's schema that's genuinely read-then-written
under contention — every remittance credits/debits it — so it's the natural vehicle for locking, atomic
updates, and isolation-level demos. `idempotency_records.key` (`UNIQUE`) is the natural vehicle for the
uniqueness-under-concurrency demo. See [architecture.md](architecture.md)'s `UnitOfWork` bullet for the
documented, still-true gap this lab explains the mechanics of: `SendRemittanceUseCase` wraps its writes in
a real transaction (atomicity), but doesn't take a row lock on the wallets it reads — this lab is where
you can see, concretely, what adding one would change.

## Where the code lives

- `src/infra/persistence/postgresql/concurrency-lab/` — `WalletLockRepository` (pessimistic lock + atomic
  update), `WalletOptimisticRepository` (optimistic concurrency), `isolation.ts`
  (`runInIsolatedTransaction` helper), `query-executor.ts` (the minimal `{ query(sql, params) }` type both
  `Pool` and `PoolClient` satisfy — see its file comment for why).
- `src/infra/persistence/postgresql/postgres-idempotency-repository.ts` — already existed; the idempotency
  demo below exercises it directly. It's the real Postgres adapter for `IdempotencyRepository`, currently
  unused by any `*-factory.ts` (the app wires idempotency to Redis instead — see architecture.md).
- `migrations/004_add_wallet_version.sql` — adds `wallets.version` (`INTEGER NOT NULL DEFAULT 0`), used
  only by the optimistic-concurrency demo. Additive; nothing in the production write path reads it.
- `__tests__/concurrency/` — one test file per concept below, plus `support/db.ts` (throwaway
  account/wallet fixtures in the real tables, created and torn down per test — never the seeded treasury
  wallets).

## How to run

```bash
npm run db:migrate        # applies 004_add_wallet_version.sql along with everything else
npm run test:concurrency  # needs a reachable Postgres — same one npm run dev/start uses
```

Separate from `npm test` on purpose: `npm test` never touches Postgres (see AGENTS.md); this suite always
does, same convention as `npm run test:integration` (Cucumber) being its own command.

---

## Concept: Transaction

**SQL** (`PostgresUnitOfWork`, already in production — `infra/persistence/postgresql/postgres-unit-of-work.ts`):

```sql
BEGIN;
-- operations
COMMIT;
```
```sql
ROLLBACK;
```

**Behavior:** every write inside `BEGIN`/`COMMIT` is all-or-nothing — a thrown error anywhere in the
callback rolls everything in it back instead of leaving a partial write. This already exists and isn't
re-demonstrated here; every other concept below either runs inside an explicit transaction (pessimistic
lock, isolation levels) or is a single autocommitting statement by design (atomic update, optimistic
concurrency, idempotency).

## Concept: Pessimistic Lock

**Test:** [`__tests__/concurrency/pessimistic-lock.test.ts`](../__tests__/concurrency/pessimistic-lock.test.ts)
**SQL:** [`WalletLockRepository.findByIdForUpdate`](../src/infra/persistence/postgresql/concurrency-lab/wallet-lock-repository.ts)

```sql
SELECT id, balance_minor_units, version
FROM wallets
WHERE id = $1
FOR UPDATE;
```

**Behavior:** the selected row is locked until the holding transaction ends (`COMMIT` or `ROLLBACK`). A
concurrent `FOR UPDATE` — or a plain `UPDATE` — against the same row from another transaction blocks until
then.

**Timeline** (two real connections, `client1`/`client2`):

```text
T1                                    T2

BEGIN
SELECT ... FOR UPDATE   (locks row)
                                       BEGIN
                                       SELECT ... FOR UPDATE   → blocks
UPDATE ...
COMMIT                  (releases)
                                       ↳ unblocks, proceeds, sees T1's write
```

**Resulting state:** T2's `SELECT` only resolves after T1 commits, and reads T1's committed value — proven
in the test by polling `pg_stat_activity.wait_event_type = 'Lock'` for T2's backend pid (a real fact
Postgres itself reports), not by sleeping a guessed duration.

## Concept: Atomic Update

**Test:** [`__tests__/concurrency/atomic-update.test.ts`](../__tests__/concurrency/atomic-update.test.ts)
**SQL:** [`WalletLockRepository.debitAtomic`](../src/infra/persistence/postgresql/concurrency-lab/wallet-lock-repository.ts)

```sql
UPDATE wallets
SET balance_minor_units = balance_minor_units - $1
WHERE id = $2 AND balance_minor_units >= $1;
```

**Behavior:** no `SELECT`, no lock, no transaction needed — the `WHERE` clause is re-checked against the
row's *current* value inside the same statement, and the row-level lock the `UPDATE` itself takes is
enough. The affected-row count (`rowCount`) is the only signal of success; there's nothing to catch or
retry.

**Resulting state:** the test fires 20 concurrent debits of 100 against a wallet seeded with 500 via
`Promise.all` (genuine, unordered concurrency — no scripted ordering). Exactly 5 succeed
(`rowCount === 1`), 15 fail (`rowCount === 0`), and the final balance (0) never goes negative — backed
further by `CHECK (balance_minor_units >= 0)` from `001_init_schema.sql`.

## Concept: Optimistic Concurrency

**Test:** [`__tests__/concurrency/optimistic-concurrency.test.ts`](../__tests__/concurrency/optimistic-concurrency.test.ts)
**SQL:** [`WalletOptimisticRepository.updateBalanceOptimistic`](../src/infra/persistence/postgresql/concurrency-lab/wallet-optimistic-repository.ts)

```sql
UPDATE wallets
SET balance_minor_units = $1,
    version = version + 1
WHERE id = $2
  AND version = $3;
```

**Behavior:** unlike the pessimistic lock above, no lock is held while the caller computes the new
balance — any number of readers can read the same `(balance, version)` pair at once. `WHERE version = $3`
is what detects a conflict: `rowCount === 0` means someone else's `UPDATE` already won and bumped the
version, and the caller must re-read and retry, never assume its write landed just because the query
didn't throw.

**Resulting state:** two callers read the same `version`, race their writes via `Promise.all`; exactly one
gets `rowCount === 1`, the other `rowCount === 0`, and the final `version` is bumped exactly once. A second
test shows the loser recovering by re-reading the fresh version and retrying successfully.

## Concept: Isolation Level

**Test:** [`__tests__/concurrency/isolation-levels.test.ts`](../__tests__/concurrency/isolation-levels.test.ts)
**SQL:** [`isolation.ts`](../src/infra/persistence/postgresql/concurrency-lab/isolation.ts) (single-transaction helper); the test itself interleaves two transactions by hand to control timing precisely

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;   -- or REPEATABLE READ / SERIALIZABLE
-- operations
COMMIT;
```

**Behavior:** the isolation level only changes how *this* transaction's reads/writes interact with
*other* concurrent transactions — it isn't a lock and never blocks anything by itself. Both transactions in
the test do the same naive thing: read the balance, then later write a new value computed from that
read, unconditionally, by `id` alone (exactly the bug the rest of this lab exists to explain).

**Timeline / resulting state — the isolation level alone decides what happens to T2:**

```text
READ COMMITTED (Postgres' default)          REPEATABLE READ / SERIALIZABLE

T1 BEGIN                                    T1 BEGIN
T1 SELECT (sees 1000)                       T1 SELECT (sees 1000)
                    T2 BEGIN                                    T2 BEGIN
                    T2 SELECT (sees 1000)                       T2 SELECT (sees 1000)
T1 UPDATE -> 1100                           T1 UPDATE -> 1100
T1 COMMIT                                   T1 COMMIT
                    T2 UPDATE -> 1200                           T2 UPDATE -> 1200
                    ↳ succeeds, no error                        ↳ FAILS: 40001 could not
                      silently overwrites T1's write               serialize access due to
                    T2 COMMIT                                      concurrent update
```

Under `READ COMMITTED`, T2's blind `UPDATE` re-evaluates its `WHERE` clause against T1's now-current,
already-committed row and applies anyway — a silent lost update, final balance 1200, T1's +100 is gone.
Under `REPEATABLE READ`/`SERIALIZABLE`, Postgres instead detects the row changed since T2's transaction
snapshot began and rejects T2's write with SQLSTATE `40001` — final balance stays 1100, T2 must catch that
and retry from a fresh read (exactly the optimistic-concurrency pattern above).

## Database Constraint

**SQL** (already in production — `001_init_schema.sql`):

```sql
CHECK (balance_minor_units >= 0)
```

**Behavior:** the backstop under every technique above. `atomic-update.test.ts` exercises it indirectly
(the `WHERE balance_minor_units >= $1` clause is what prevents ever reaching a state the `CHECK` would
reject) — it's the difference between "the application logic prevented an overdraft" and "the database
would have refused one regardless."

## Concept: Idempotency

**Test:** [`__tests__/concurrency/idempotency-unique-constraint.test.ts`](../__tests__/concurrency/idempotency-unique-constraint.test.ts)
**SQL:** [`PostgresIdempotencyRepository.claim`](../src/infra/persistence/postgresql/postgres-idempotency-repository.ts) (already existed, not new to this lab)

```sql
INSERT INTO idempotency_records (key) VALUES ($1)
ON CONFLICT (key) DO NOTHING;
```

**Behavior:** `idempotency_records.key` is `UNIQUE` (`001_init_schema.sql`). N concurrent requests
carrying the same `Idempotency-Key` all attempt this `INSERT` at once, each on its own pooled connection —
genuine concurrency, not a scripted ordering. The unique index is what decides the race: only one `INSERT`
can ever land; every other caller's `rowCount` is 0, straight from the constraint, with no
application-level locking involved.

**Resulting state:** of 10 concurrent `claim()` calls with the same key, exactly one returns `true`; a
`count(*)` against `idempotency_records` for that key is 1, not 10. This is the same SQL
`RedisIdempotencyRepository`'s `SET key IN_FLIGHT NX EX 30` reproduces at the Redis level in production
today (see architecture.md's "Idempotency" bullet) — this lab shows the Postgres-native equivalent
directly.
