---
name: Database Migrate
description: Apply Postgres migrations (npm run db:migrate) against the reachable database
disable-model-invocation: true
allowed-tools: Bash(npm run db:migrate*)
---

Apply all pending SQL migrations under `migrations/` (currently `001_init_schema.sql`,
`002_seed_treasury_wallets.sql`, `003_create_outbox_events.sql`, plus any added since) to whatever Postgres
the app's `POSTGRES_*` env vars point at.

This touches a real database — only run it when the user explicitly asks, never infer it from context.

```!
npm run db:migrate
```

If it fails, report the actual error (connection refused, already-applied migration, syntax error, etc.)
instead of retrying blindly — check `docs/infrastructure.md` for required env vars first.
