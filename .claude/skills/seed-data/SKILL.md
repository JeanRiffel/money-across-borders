---
name: Seed Test Data
description: Generate deterministic financial fixture data (customers, wallets, remittances) into Postgres via npm run seed
disable-model-invocation: true
allowed-tools: Bash(npm run seed*)
---

Generate a deterministic, financially-coherent dataset directly against Postgres for functional/
concurrency/load testing — see [docs/seed.md](../../../docs/seed.md) for the full option reference,
distributions, and its documented deviations from the live HTTP flow.

Requires a reachable, **migrated** Postgres with no business data yet (use `/db-migrate` first, and
`--reset` to wipe business tables before re-seeding).

1. If `$ARGUMENTS` is empty, run with the documented defaults:
   ```!
   npm run seed -- --customers 100 --seed 42
   ```
2. Otherwise pass `$ARGUMENTS` straight through (e.g. `--customers 1000 --scenario high-contention --seed 42`,
   or `--help` to list every flag):
   ```!
   npm run seed -- $ARGUMENTS
   ```

Report the summary the script prints (counts per table/status) so the user can confirm the dataset shape.
