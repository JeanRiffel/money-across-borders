---
name: Run Tests
description: Run the Jest use-case test suite (npm test), optionally scoped to a pattern, no external services needed
allowed-tools: Bash(npm test*)
---

Run the project's Jest suite. It runs entirely against the in-memory repos
(`src/infra/persistence/in-memory/`) — no Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, or Mongo needed.

1. If `$ARGUMENTS` is empty, run the full suite:
   ```!
   npm test
   ```
2. If `$ARGUMENTS` is given, treat it as a pattern (path or `-t` substring) and run only matching tests:
   ```!
   npm test -- $ARGUMENTS
   ```
3. Report failures with the actual Jest output — don't summarize away a red run.

This is a different suite from `/concurrency-lab` (needs real Postgres) and `npm run test:integration`
(Cucumber, also needs Postgres) — see [AGENTS.md](../../../AGENTS.md) for the full command list.
