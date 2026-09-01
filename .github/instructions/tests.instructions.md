---
applyTo: "__tests__/**,features/**"
---

Tests — see [AGENTS.md](../../AGENTS.md) "Commands" and
[docs/definition-of-done.md](../../docs/definition-of-done.md) for full context.

- **Prefer deterministic tests.** No reliance on real wall-clock timing, real network calls, or unseeded
  randomness — use the `Clock` port / a fixed `Date` for time, `InMemory*` fakes for repositories, and (for
  the seed pipeline) the seeded PRNG (`rng/deterministic-rng.ts`) the same way `generate-dataset.test.ts`
  already does.
- **Use in-memory tests for fast unit testing.** `__tests__/` mirrors `src/`'s path structure and prefers
  `InMemory*` repository fakes over mocking frameworks for use-case tests (e.g.
  `src/domain/account/entities/account.ts` → `__tests__/domain/entities/account.test.ts`) — this is what
  `npm test` runs, with **no external services**, not even Postgres. Add here for new domain/application
  logic; this suite should stay fast and infrastructure-free.
- **Use real PostgreSQL for database/concurrency behavior**, not a mock of it. `npm run test:concurrency`
  (`__tests__/concurrency/`) exercises real locking/isolation-level/idempotency-uniqueness behavior against
  actual Postgres — see [docs/concurrency-lab.md](../../docs/concurrency-lab.md). `npm run test:integration`
  (`features/`, Cucumber) exercises the real Express app end to end via `buildApp()` against real Postgres
  (and, transitively, Redis) — no in-memory repos, no mocking. Both need a reachable, **migrated** Postgres
  (`/db-migrate` first); the concurrency suite additionally needs `migrations/004_add_wallet_version.sql`
  applied. Don't fake these interactions with mocks — the entire point is verifying real database behavior.
- **Tests should validate business invariants, not merely implementation details.** Assert on outcomes that
  matter financially — balance after a debit, ledger legs net to zero per currency, a duplicate
  `Idempotency-Key` doesn't double-execute — rather than on internal call counts or private state. When
  adding a test for a change near [docs/invariants.md](../../docs/invariants.md), consider whether it should
  assert the invariant directly (e.g. "wallet balance equals the sum of its ledger entries") rather than only
  the specific bug being fixed.
- Cucumber (`features/`) writes to a real, non-rolled-back database — generate unique data per scenario
  (e.g. a fresh email) rather than reusing a fixed fixture, matching the existing step definitions.
- Don't claim `test:integration`/`test:concurrency`/`test:seed` passed without actually running them against
  reachable infrastructure — if Postgres/Redis aren't available in your environment, say so explicitly (see
  [docs/definition-of-done.md](../../docs/definition-of-done.md)) instead of assuming they'd pass.
