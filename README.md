# Money Across Borders — Cross-Border Payment Platform

A **cross-border remittance platform** (multi-currency wallets, FX conversion, and international money
transfer — in the spirit of Wise, Nomad, and Remessa Online) designed to demonstrate **Clean Architecture,
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
* Idempotency keys

Key characteristics:

* ACID compliant
* `SERIALIZABLE` isolation level
* Explicit row locking
* Retry handling for serialization failures

---

### Redis — Performance & Coordination

Used only where it adds real value:

* Fast lookup of idempotency keys
* Optional distributed locking
* Optional rate limiting

⚠️ Redis is **never** the source of truth.

---

### MongoDB — Audit & Observability

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

* Transaction processed events
* Ledger update notifications
* Audit persistence
* Future integrations (email, webhooks)

Supports:

* Loose coupling
* Eventual consistency where appropriate

---

## 🔐 Idempotency Strategy

All mutating endpoints require an `Idempotency-Key` header.

Flow:

1. Request arrives with `Idempotency-Key`
2. System checks Redis / PostgreSQL
3. If key exists → previously stored response is returned
4. If not → request is processed atomically
5. Result is persisted together with the idempotency key

This guarantees **exactly-once semantics**, even under retries or duplicate requests.

---

## 🧮 Transactions & Consistency

All balance mutations are executed inside:

* `SERIALIZABLE` transactions
* Explicit row-level locks
* Controlled retry logic

This ensures:

* No lost updates
* No dirty reads
* No phantom reads
* Strong financial correctness

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

* Docker Compose spins up:

  * Multiple API instances
  * NGINX load balancer
  * PostgreSQL
  * Redis
  * MongoDB
  * RabbitMQ

Detailed instructions are provided in `docker-compose.yml`.

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
