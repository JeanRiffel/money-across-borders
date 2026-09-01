---
name: Docker Stack
description: Bring up the full app + Postgres + Redis + RabbitMQ + Kafka + Elasticsearch + workers via docker compose
disable-model-invocation: true
allowed-tools: Bash(docker compose*)
---

Build and start the entire stack — the app plus Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, and all
three workers (`worker:account-created`, `worker:remittance-indexer`, `worker:outbox-relay`) — in
containers, with no local installs needed. See [docs/infrastructure.md](../../../docs/infrastructure.md)
for what each service backs and which are fatal-at-boot (Postgres, Redis) vs non-fatal.

This is heavyweight (builds images, starts 8+ containers) — only run it when the user explicitly asks.

```!
docker compose up --build
```
