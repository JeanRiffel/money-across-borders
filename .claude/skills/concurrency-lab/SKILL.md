---
name: Concurrency Lab
description: Run the Postgres locking/isolation/idempotency concurrency lab (npm run test:concurrency)
disable-model-invocation: true
allowed-tools: Bash(npm run test:concurrency*)
---

Run the concurrency lab suite — raw-`pg` tests against the real `wallets` and `idempotency_records` tables
that demonstrate row locking, isolation levels, and idempotent-key uniqueness under contention. See
[docs/concurrency-lab.md](../../../docs/concurrency-lab.md) for what each demo shows and why.

Requires a reachable, **migrated** Postgres (`/db-migrate` first, including
`migrations/004_add_wallet_version.sql` for the optimistic-concurrency demo).

```!
npm run test:concurrency
```

This is separate from `/run-tests` (in-memory Jest suite) and from the production write path — the lab's
repositories (`WalletLockRepository`, `WalletOptimisticRepository`) are not wired into any `*-factory.ts`.
