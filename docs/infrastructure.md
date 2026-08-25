# Infrastructure

## What each service backs

**Postgres** and **Redis** are the two load-bearing dependencies: the app requires both reachable and
migrated to boot at all (`server.ts` fails fast, `process.exit(1)`, if either connection check fails).
Postgres backs the account/wallet/ledger/remittance/KYC write path
(`src/infra/persistence/postgresql/postgres-registry.ts`, wired into every `*-factory.ts`). Idempotency
(`IdempotencyRepository` for `account`/`wallet`/`remittance`/`kyc`) is Redis-backed
(`src/infra/persistence/redis/`) — a real, load-bearing dependency, not a dead client.

Beyond Postgres/Redis, four more pieces of infra are wired to specific, narrow jobs — all **non-fatal at
boot**, none of them a correctness guarantee for the account/wallet/remittance write path itself:

- **RabbitMQ**: `CreateAccountUseCase` no longer publishes `account.created` directly — it writes the event
  to a Postgres **Transactional Outbox** (`outbox_events`, inside the same transaction as the User + Account
  saves; see the Transactional Outbox bullet in [architecture.md](architecture.md)) instead, closing the gap
  where a broker outage or a crash between commit and publish used to lose the event silently
  (`EventPublisher`'s contract is "must not throw," so nothing surfaced that loss). A separate relay worker
  (`npm run worker:outbox-relay`) polls that table and is the only thing that actually publishes to
  RabbitMQ, consumed in turn by another standalone worker (`npm run worker:account-created`) that simulates
  sending a confirmation email. A task-queue-shaped job — one event, one consumer, no replay needed.
- **Kafka**: `SendRemittanceUseCase` publishes `remittance.completed` after its transaction commits, consumed
  by a standalone worker (`npm run worker:remittance-indexer`) that indexes it into Elasticsearch. An
  event-stream-shaped job instead — a business fact a consumer group can replay, chosen over RabbitMQ for
  that reason (see the `EventPublisher` bullet in [architecture.md](architecture.md) for the full reasoning).
- **Elasticsearch**: backs `GET /remittances` only (`SearchRemittancesUseCase`, CQRS read side) — a
  denormalized, eventually-consistent projection kept in sync by the Kafka consumer above, never the
  destination of a write path itself. `RemittanceRepository` (Postgres) remains the source of truth; this
  index can lag or, if Elasticsearch is down when a request comes in, error — GET /remittances is the only
  thing that depends on it.
- **Mongo**: backs `POST /kyc`'s dossier archive only (`MongoKycDossierRepository`, see the `EventPublisher`
  sibling note in [architecture.md](architecture.md)) — the raw submitted material (documents, notes), never
  the `KycProfile` status `ComplianceChecker` actually reads (that's Postgres). Everything else
  (account/wallet/remittance) still doesn't touch Mongo.

## Environment / running

There is no `node_modules` installed in this environment — run `bun install` or `npm install` first.

Copy `.env.example` to `.env` before running the server; it needs `JWT_SECRET`, `POSTGRES_HOST`/
`POSTGRES_PORT`/`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DATABASE`, `REDIS_HOST`/`REDIS_PORT`/
`REDIS_PASSWORD` (password optional — unset unless the Redis you're pointing at actually requires one),
`RABBITMQ_HOST`/`RABBITMQ_PORT`/`RABBITMQ_USER`/`RABBITMQ_PASSWORD`, `KAFKA_BROKERS`/`KAFKA_CLIENT_ID`,
`ELASTICSEARCH_URL`, `MONGO_HOST`/`MONGO_PORT`/`MONGO_USER`/`MONGO_PASSWORD`/`MONGO_DATABASE`. Postgres and
Redis must both be reachable before `npm run dev`/`npm start`/either `worker:*` script — run `npm run
db:migrate` once (idempotent, safe to re-run) against a fresh Postgres database first; the server exits
immediately if either connection check fails. RabbitMQ/Kafka/Elasticsearch/Mongo all degrade non-fatally if
unreachable rather than blocking boot (see above for exactly what each backs). `npm test` needs none of
this — it never touches Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, or Mongo. Every config module that
reads `process.env.*` (`pg.ts`, `redisClient.ts`, `rabbitmq-connection.ts`, `kafka-connection.ts`,
`elasticsearch-client.ts`, `mongo-database.ts`) calls `dotenv.config()` itself at import time — don't assume
an entrypoint has already loaded `.env` before importing one; skipping this bit the `worker:account-created`
script once (RabbitMQ env vars read as `undefined`, connection fell back to `guest:guest@localhost` and
failed auth) before `rabbitmq-connection.ts` got its own `dotenv.config()` call, matching `pg.ts`'s existing
pattern. Also separately: `mongo-database.ts` used to read `MONGO_HOST` directly as if it were a full
connection string and `MONGO_DB` for the database name — neither var existed anywhere (`.env.example` had
`MONGO_URI`; `.env` conventionally has `MONGO_HOST` as a bare hostname plus `MONGO_DATABASE`) — now fixed to
build the connection string from `MONGO_HOST`/`MONGO_PORT`/`MONGO_USER`/`MONGO_PASSWORD` and read
`MONGO_DATABASE`, matching the HOST/PORT/USER/PASSWORD convention every other service here uses.
Observability vars (`LOG_LEVEL`, `LOKI_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`) are
optional — an unreachable Loki/Tempo degrades gracefully rather than blocking boot.

## Docker

`docker compose up --build` runs nine services: `postgres`, `redis`, `rabbitmq`, `kafka`, `elasticsearch`,
`app`, `worker-account-created`, `worker-remittance-indexer`, and `worker-outbox-relay`. Mongo is the one
intentionally left out — nothing in the current request path *requires* it (`POST /kyc` degrades to
"dossier not archived" without it, same as RabbitMQ/Kafka/Elasticsearch degrade without theirs), so it isn't
simulated just because `.env.example` lists it. `docker-entrypoint.sh` runs `npm run db:migrate` before
starting the server on every container start, so no manual migration step is needed with this path. The
`app` service builds from the repo's `Dockerfile` (multi-stage, `ts-node` + `tsconfig-paths` at runtime — no
separate `tsc` build step, since several files import via the `src/...` baseUrl alias that plain compiled JS
wouldn't resolve); all three `worker-*` services reuse the same image but override `entrypoint:` to run
their consumer/relay script directly, bypassing `docker-entrypoint.sh` (which always runs migrations + the
HTTP server regardless of `CMD`, so it can't be reused for a different process as-is). `app` depends on
`postgres` and `redis` being healthy before starting (both are fatal-if-unreachable, see above) but only on
`rabbitmq`/`kafka`/`elasticsearch` having *started* — not healthy — since all three are non-fatal and
shouldn't hold up boot. `worker-outbox-relay` is the one worker that also depends on `postgres` being
*healthy* (not just started, unlike the other two workers) — it polls `outbox_events` directly, the same
table `CreateAccountUseCase` writes to, so it needs a real, migrated Postgres to have anything to read.

Host-side ports default away from each service's standard port (`6380` not `6379`, `5673`/`15673` not
`5672`/`15672`, `9094` not `9092`, `9201` not `9200`) so `docker compose up` here doesn't collide with a
same-named service you might already have running elsewhere on the host (e.g. a separate local dev
stack) — the app always talks to these over the compose network on their standard ports regardless
(`postgres:5432`, `redis:6379`, `rabbitmq:5672`, `kafka:29092` — not `kafka:9092`, that listener is only
advertised for host-side clients outside the compose network — and `elasticsearch:9200`). Postgres alone
predates this convention with its own non-standard host port (`localhost:55432`), for the same reason. This
is still a deliberately minimal setup, not the multi-node NGINX + full-stack one the README describes — see
[known-issues.md](known-issues.md) for that gap.

A `docker-compose.yml` covers Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, the app, and both
`worker-*` services above, but it's still not the multi-node NGINX load balancing + Mongo stack the
README's "Running Locally" section describes — that fuller setup (NGINX, multiple API instances, Mongo as
a compose service) is still not present in the repo (Mongo runs outside Docker for this project, whatever
`MONGO_HOST`/etc. in `.env` point at). Outside Docker, every one of Postgres/Redis/RabbitMQ/Kafka/
Elasticsearch/Mongo is whatever its own `*_HOST`/etc. vars in `.env` point at, started/managed outside this
repo.
