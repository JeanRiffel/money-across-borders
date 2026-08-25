# Money Across Borders — Cross-Border Payment Platform

A **cross-border remittance platform** (multi-currency wallets, FX conversion, and international money
transfer) designed to demonstrate **Clean Architecture,
DDD, SOLID, ACID transactions, idempotency, and horizontal scalability** using a realistic fintech-inspired
domain. It's still, first and foremost, an architecture showcase: the payments domain is the vehicle, not
the point.

> Note: the sections below this point predate the cross-border pivot and describe the project's original
> account/ledger framing — see [CLAUDE.md](CLAUDE.md) for the current architecture and domain model
> (wallets, ledger, exchange, compliance, remittance).

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

```
                ┌──────────────┐
                │   NGINX LB   │
                └──────┬───────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ API Node #1 │ │ API Node #2 │ │ API Node #3 │
│  (Stateless)│ │  (Stateless)│ │  (Stateless)│
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │
       ├───────────────┴───────────────┤
       │
┌───────────────────────────────────────────┐
│ PostgreSQL | Redis | MongoDB | RabbitMQ   │
└───────────────────────────────────────────┘
```

---

## 🧩 Technology Choices & Responsibilities

### PostgreSQL — Source of Truth

Used for all **critical financial data**:

* Accounts
* Ledger entries
* Balances
* ~~Idempotency keys~~ — moved to Redis, see below

Key characteristics:

* ✅ ACID compliant, atomic multi-write transactions (`UnitOfWork` — `BEGIN`/`COMMIT`/`ROLLBACK`
  around `SendRemittanceUseCase`)
* 🚧 `SERIALIZABLE` isolation level, explicit row locking (`SELECT ... FOR UPDATE`), retry handling for
  serialization failures — none of these are implemented; transactions run at Postgres's default
  isolation level with no row locking on the wallet reads inside `SendRemittanceUseCase`. Atomicity
  (all-or-nothing) is guaranteed; concurrent-debit race safety is not — see [CLAUDE.md](CLAUDE.md)'s
  `UnitOfWork` note.

---

### Redis — Performance & Coordination

Used only where it adds real value:

* ✅ Fast lookup of idempotency keys — implemented: `account`/`wallet`/`remittance` idempotency is
  Redis-backed (`SET ... NX EX` for the atomic claim, TTL-based expiry instead of Postgres's
  never-pruned `idempotency_records` table)
* 🚧 Distributed locking — not implemented; see [CLAUDE.md](CLAUDE.md)'s `UnitOfWork` note on the
  concurrent-debit race this would need to close
* 🚧 Rate limiting — not implemented

⚠️ Redis is **never** the source of truth.

---

### MongoDB — Audit & Observability

🚧 Not implemented — the app connects and logs at boot (non-fatal if unreachable) and nothing else
touches it. The rest of this section describes the target design, not current behavior.

Stores:

* Raw transaction requests
* Processed event snapshots
* Debug and audit logs

This allows:

* Easy inspection
* Replay scenarios
* Separation of transactional and analytical workloads

---

### RabbitMQ — Event-Driven Workflow

Used for asynchronous processing:

* ✅ Simulated confirmation email — implemented: `CreateAccountUseCase` publishes `account.created`
  after signup, consumed by a standalone worker (`npm run worker:account-created`) that logs a
  simulated "email sent" line
* 🚧 Transaction/ledger update notifications, audit persistence, real email/webhook delivery — not
  implemented; the one thing wired up today is the account-created case above

Supports:

* Loose coupling
* Eventual consistency where appropriate

Publishing is deliberately **best-effort**, not `UnitOfWork`-grade: an unreachable broker logs a
warning and the triggering request still succeeds — see [CLAUDE.md](CLAUDE.md)'s `EventPublisher` note
for why that's the right trade-off for a non-critical side effect like this one (and the wrong one for
an actual ledger write).

---

## 🔐 Idempotency Strategy

All mutating endpoints require an `Idempotency-Key` header.

Flow:

1. Request arrives with `Idempotency-Key`
2. System checks Redis (the current backing store for `account`/`wallet`/`remittance` — see the Redis
   section above; `PostgresIdempotencyRepository` still exists in the codebase but isn't wired to
   anything today)
3. If key exists → previously stored response is returned
4. If not → request is processed atomically
5. Result is persisted together with the idempotency key

This guarantees **exactly-once semantics**, even under retries or duplicate requests.

---

## 🧮 Transactions & Consistency

All balance mutations in `SendRemittanceUseCase` run inside one Postgres transaction (`UnitOfWork` —
see [CLAUDE.md](CLAUDE.md)), so a failure partway through rolls back every wallet/ledger/remittance
write instead of leaving a partial posting.

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

`docker-compose.yml` exists today, but as a minimal setup, not the multi-node/NGINX one this section
used to describe (see CLAUDE.md's "Known inconsistencies"):

```bash
docker compose up --build
```

spins up:

  * The API (built from `Dockerfile`, migrations applied automatically on start)
  * PostgreSQL — required; the API fails to start without it
  * Redis — required; backs idempotency for `account`/`wallet`/`remittance` (see the Redis section above)
  * RabbitMQ — optional at boot; backs the simulated confirmation-email flow (see the RabbitMQ section above)
  * A worker process consuming the confirmation-email events off RabbitMQ

That's it — MongoDB isn't part of this compose file, since nothing in the current request path uses it;
multiple API instances behind an NGINX load balancer also aren't implemented yet.
See `docker-compose.yml` and `CLAUDE.md` for what's actually wired up.

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
