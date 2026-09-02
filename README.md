# Money Across Borders — Cross-Border Payment Platform

A **cross-border remittance platform** (multi-currency wallets, FX conversion, and international money
transfer) designed to demonstrate **Clean Architecture,
DDD, SOLID, ACID transactions, idempotency, and horizontal scalability** using a realistic fintech-inspired
domain. It's still, first and foremost, an architecture showcase: the payments domain is the vehicle, not
the point.

> Note: the "Domain Overview," "Core Use Cases," and "Clean Architecture Structure" sections below predate
> the cross-border pivot and describe the project's original account/ledger framing — see
> [AGENTS.md](AGENTS.md) for the current domain model (wallets, ledger, exchange, compliance, remittance).
> The "Technology Choices & Responsibilities" and "Running Locally" sections have been refreshed to match
> what's actually implemented today; see [docs/infrastructure.md](docs/infrastructure.md) and
> [docs/architecture.md](docs/architecture.md) for the full detail behind them.

This project is intentionally **small in surface area** (few endpoints) and **deep in architectural concepts**, focusing on correctness, consistency, and scalability rather than feature sprawl.

---

## 🎯 Goals of This Project

This repository exists to show that I can:

* Design **transactionally safe** systems (ACID, SERIALIZABLE isolation)
* Implement **idempotent APIs** correctly
* Apply **Clean Architecture & DDD** in a real backend system
* Use **polyglot persistence** with clear responsibility boundaries
* Build **event-driven workflows** with message queues
* Scale stateless services behind a **load balancer**

This is not a tutorial project — it mirrors **real-world payment and ledger systems**.

---

## 🧠 Domain Overview

The system manages **accounts and ledger entries**.

All balance changes are recorded as immutable ledger entries (double-entry style), ensuring:

* Auditability
* Traceability
* Strong consistency

### Core Use Cases

* Create an account
* Credit an account
* Debit an account
* Transfer between accounts
* Query account balance
* List ledger entries

---

## 🏗️ Architecture Overview

One Express API instance talks synchronously to the two services it can't boot without; everything else
is an optional, non-fatal side path wired to one specific job:

**Synchronous dependencies** — the API talks to these directly, on the request path:

```
Express API (1 node)
 ├─▶ PostgreSQL   [required, blocks boot]  accounts, wallets, ledger, remittances, KYC, outbox_events
 ├─▶ Redis        [required, blocks boot]  idempotency keys (account/wallet/remittance/kyc)
 └─▶ MongoDB      [optional, non-fatal]    KYC dossier archive (POST /kyc only)
```

**Asynchronous pipelines** — each is a straight line from a use case, through a broker, to a standalone
worker process; none of them sit on the request path, and all degrade non-fatally if unreachable:

```
CreateAccountUseCase
  → outbox_events (same Postgres transaction as the signup)
  → worker:outbox-relay (polls the table)
  → RabbitMQ (account.created)
  → worker:account-created
  → logs a simulated confirmation email

SendRemittanceUseCase
  → Kafka (remittance.completed, published after the transaction commits)
  → worker:remittance-indexer
  → Elasticsearch
  → GET /remittances reads from here (CQRS read model; Postgres stays the source of truth)
```

A multi-node API behind an NGINX load balancer, as described further down in "Scalability Approach," is
the target design, not what's running today — see [docs/known-issues.md](docs/known-issues.md).

---

## 🧩 Technology Choices & Responsibilities

Two services are **load-bearing**: the app fails fast (`process.exit(1)`) at boot if either is
unreachable. Four more back one specific, narrow job each and are **non-fatal** if unreachable — the
request path that doesn't touch them keeps working. See [docs/infrastructure.md](docs/infrastructure.md)
for the full detail (env vars, Docker ports, exact failure modes) behind every bullet below.

### PostgreSQL — Source of Truth (required)

All critical financial data: accounts, wallets, ledger entries, remittances, KYC profiles, and the
transactional outbox (`outbox_events`).

* ✅ ACID, atomic multi-write transactions (`UnitOfWork` — real `BEGIN`/`COMMIT`/`ROLLBACK` around
  `SendRemittanceUseCase`)
* ✅ Transactional Outbox: `CreateAccountUseCase` writes `account.created` to `outbox_events` inside the
  *same* transaction as the User + Account saves, closing the gap where a broker outage or crash between
  commit and publish used to lose the event silently
* 🚧 `SERIALIZABLE` isolation, explicit row locking (`SELECT ... FOR UPDATE`), retry-on-serialization —
  not implemented; transactions run at Postgres's default isolation with no row locking on the wallet
  reads inside `SendRemittanceUseCase`. Atomicity (all-or-nothing) is guaranteed; concurrent-debit race
  safety is not — see [docs/architecture.md](docs/architecture.md)'s `UnitOfWork` note.

### Redis — Idempotency (required)

* ✅ `account`/`wallet`/`remittance`/`kyc` idempotency keys are Redis-backed: `SET key IN_FLIGHT NX EX
  <30s>` for the atomic claim, then an overwrite with the response under a 24h TTL. A Lua
  check-and-delete script backs `release()` so it can never clobber a response a concurrent `save()`
  already wrote. (`PostgresIdempotencyRepository` still exists in the codebase, correct but unused by any
  factory now.)
* 🚧 Distributed locking, rate limiting — not implemented

⚠️ Redis is **never** the source of truth.

### RabbitMQ — Task Queue (optional, non-fatal)

Backs exactly one flow today: the simulated account-confirmation email. `npm run worker:outbox-relay`
polls `outbox_events` (default every 5s) and is the only thing that actually publishes to RabbitMQ; `npm
run worker:account-created` consumes `account.created` off it and logs a simulated "email sent" line. A
task-queue-shaped job — one event, one consumer, no replay needed — which is why it went through the
outbox above rather than a direct `publish()` call. A failed delivery is retried (broker-native delay,
`x-retry-count` in message headers) before landing in a `account.created.dlq` dead-letter queue, and
duplicate deliveries are deduped via the same Redis-backed idempotency store the HTTP layer uses — see
[docs/resilience.md](docs/resilience.md).

### Kafka — Event Stream (optional, non-fatal)

Backs the remittance search read model. `SendRemittanceUseCase` publishes `remittance.completed` after
its transaction commits (published *outside* the transaction on purpose, so a rolled-back remittance can
never have already announced itself as completed); `npm run worker:remittance-indexer` consumes it and
indexes into Elasticsearch. An event-stream-shaped job — a business fact a consumer group can replay —
chosen over RabbitMQ for that reason; it does **not** go through the transactional outbox, since Kafka's
own retention already gives it a different safety net.

### Elasticsearch — Remittance Search / CQRS Read Model (optional, non-fatal)

Backs `GET /remittances` only (`SearchRemittancesUseCase`) — a denormalized, eventually-consistent
projection kept in sync by the Kafka consumer above. Postgres's `RemittanceRepository` remains the
source of truth; this index can lag, or error if Elasticsearch is down when a search request comes in —
`GET /remittances` is the only thing that depends on it.

### MongoDB — KYC Dossier Archive (optional, non-fatal, outside Docker Compose)

Backs `POST /kyc`'s dossier archive only (`MongoKycDossierRepository`) — the raw submitted material
(documents, notes), never the `KycProfile` status the compliance checker actually reads (that's
Postgres). Everything else (account/wallet/remittance) doesn't touch it. Deliberately left out of
`docker-compose.yml` — nothing in the request path *requires* it, so it isn't simulated just because
`.env.example` lists it; point `MONGO_HOST`/etc. in `.env` at an instance you run yourself if you want to
exercise this path.

### Observability (optional, non-fatal)

Not shown in the diagram above since it sits alongside every request rather than in one specific flow:
Pino structured logs (shipped to Loki if `LOKI_URL` is set), Prometheus RED metrics on `GET /metrics`,
and OpenTelemetry traces exported to Tempo. All three degrade gracefully — an unreachable Loki/Tempo
doesn't block boot or fail a request.

⚠️ Publishing to RabbitMQ/Kafka is deliberately **best-effort**, not `UnitOfWork`-grade: both
`EventPublisher` adapters catch and log their own connect/publish failures instead of throwing. That's
the right trade-off for a non-critical side effect like a confirmation email or a search index update —
and the wrong one for an actual ledger write, which is why those still go through Postgres's real
transactions above.

---

## 🔐 Idempotency Strategy

All mutating endpoints require an `Idempotency-Key` header.

Flow:

1. Request arrives with `Idempotency-Key`
2. System checks Redis (the current backing store for `account`/`wallet`/`remittance`/`kyc` — see the
   Redis section above; `PostgresIdempotencyRepository` still exists in the codebase but isn't wired to
   anything today)
3. If key exists → previously stored response is returned
4. If not → request is processed atomically
5. Result is persisted together with the idempotency key

This guarantees **exactly-once semantics**, even under retries or duplicate requests.

---

## 🧮 Transactions & Consistency

All balance mutations in `SendRemittanceUseCase` run inside one Postgres transaction (`UnitOfWork` —
see [docs/architecture.md](docs/architecture.md)), so a failure partway through rolls back every
wallet/ledger/remittance write instead of leaving a partial posting.

🚧 Not implemented: `SERIALIZABLE` isolation, explicit row-level locks, or retry-on-serialization-failure
logic — this repo currently guarantees all-or-nothing atomicity, not protection against a concurrent
debit race on the same wallet.

---

## 🧱 Clean Architecture Structure

```
src/
 ├── domain/
 │    ├── entities/
 │    ├── value-objects/
 │    ├── repositories/
 │    └── domain-services/
 │
 ├── application/
 │    ├── use-cases/
 │    ├── dto/
 │    └── ports/
 │
 ├── infrastructure/
 │    ├── db/
 │    │    ├── postgres/
 │    │    ├── mongo/
 │    │    └── redis/
 │    ├── messaging/
 │    │    └── rabbitmq/
 │    └── web/
 │         └── controllers/
 │
 └── main/
      ├── server.ts
      └── di.ts
```

Dependencies always point **inward**.

---

## 🌐 Scalability Approach

* Stateless API nodes
* Horizontal scaling via NGINX
* Shared infrastructure services
* Safe concurrent processing via SERIALIZABLE transactions

This setup can be scaled locally using Docker Compose and mirrors real production environments.

---

## 🚀 Running Locally (High Level)

`docker-compose.yml` exists today, but as a single-node setup, not the multi-node/NGINX one described in
"Scalability Approach" above (see [docs/known-issues.md](docs/known-issues.md)):

```bash
docker compose up --build
```

spins up nine services:

  * `app` — the API (built from `Dockerfile`; runs migrations automatically on container start,
    depends on `postgres`/`redis` being healthy before it starts)
  * `postgres` — required; the API fails to start without it
  * `redis` — required; backs idempotency for `account`/`wallet`/`remittance`/`kyc` (see the Redis
    section above)
  * `rabbitmq`, `kafka`, `elasticsearch` — optional at boot (`app` only waits for these to have
    *started*, not be healthy); back the RabbitMQ and Kafka/Elasticsearch pipelines above
  * `worker-account-created`, `worker-remittance-indexer`, `worker-outbox-relay` — the three standalone
    worker processes for the async pipelines diagrammed above

MongoDB is the one piece **not** in this compose file — nothing in the request path requires it, so it
isn't simulated just because `.env.example` lists it; point `MONGO_HOST`/etc. in `.env` at an instance
you run yourself if you want to exercise `POST /kyc`'s dossier archive. Multiple API instances behind an
NGINX load balancer also aren't implemented yet. See `docker-compose.yml` and
[docs/infrastructure.md](docs/infrastructure.md) for exact ports/env vars and what's actually wired up.

---

## 📌 Why a Ledger?

Ledger-based systems are used by:

* Payment processors
* Banks
* Crypto exchanges
* Accounting platforms

They naturally require:

* Strong consistency
* Idempotency
* Auditability
* Event-driven workflows

This project intentionally models those constraints.

---

## 📄 License

MIT
