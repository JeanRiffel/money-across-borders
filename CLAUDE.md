# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Money Across Borders** (package name `money-across-borders`; the repo/folder is still named
`clean-ledger`) is a **cross-border remittance platform** — multi-currency wallets, FX conversion, and
international money transfer between platform accounts, built as an architecture showcase: Clean Architecture, DDD, SOLID, ACID transactions,
idempotency, and horizontal scalability, in Express + TypeScript. The payments domain is the vehicle for
demonstrating the architecture, not the point of the project.

Domain shape: accounts hold one or more currency-denominated **wallets**; every balance change is recorded
as an immutable, double-entry **ledger entry**; a **remittance** converts money from one wallet's currency
to another's via a mocked FX rate and posts through system-owned per-currency **treasury** wallets so every
currency's ledger stays balanced independently (see "Cross-currency ledger balancing" below); a basic
**compliance/KYC** check gates how much an unverified sender can move.

End-to-end and reachable over HTTP today: create an account (`POST /account`), log in (`POST /login`),
open a wallet (`POST /wallets`), submit KYC (`POST /kyc`), send a remittance (`POST /remittances`), and
search remittances (`GET /remittances`). This flow is
**Postgres-backed** (`src/infra/persistence/postgresql/postgres-registry.ts`, wired into every
`*-factory.ts`) — the app requires a reachable, migrated Postgres to boot at all (`server.ts` fails fast,
`process.exit(1)`, if the connection check fails). `npm test`'s use-case tests still run entirely against
the **in-memory** repos (`src/infra/persistence/in-memory/`), constructed directly, bypassing the
factory/Postgres layer completely — see "Wiring order" below. All other external integrations (FX rates,
compliance/KYC) stay **mocked** — no real payment-rail/KYC-provider calls happen. `POST /login`
(`LoginUseCase`, behind `userRouter`) authenticates by email/password against
`User` and returns a real JWT — `/wallets` and `/remittances`, which sit behind `authMiddleware`, take that
token as a normal `Authorization: Bearer` header now; `/account` and `/login` are themselves
unauthenticated (you can't have a token before you sign up or log in). `authMiddleware` only checks that
the token is a validly-signed, unexpired JWT — it does not check that the token's `accountId` matches the
`accountId` in the request body, so any logged-in user's token currently authorizes any account's wallet/
remittance calls; there's no per-resource authorization layer yet. Several other files are mid-refactor or
stubbed (see "Known inconsistencies" below). Don't assume the whole tree compiles or that every wired-up
path is functional; check the specific files you're touching.

Idempotency itself is **not** part of that Postgres-backed flow anymore: `IdempotencyRepository` for
`account`/`wallet`/`remittance`/`kyc` is now Redis-backed (`src/infra/persistence/redis/`, see the
Idempotency bullet in Architecture below) — a real, load-bearing dependency, not the dead client it used to
be. `server.ts` fails fast on an unreachable Redis the same way it does for Postgres.

Beyond Postgres/Redis, four more pieces of infra are wired to specific, narrow jobs — all non-fatal at boot,
none of them a correctness guarantee for the account/wallet/remittance write path itself:
- **RabbitMQ**: `CreateAccountUseCase` no longer publishes `account.created` directly — it writes the event
  to a Postgres **Transactional Outbox** (`outbox_events`, inside the same transaction as the User + Account
  saves; see the `Transactional Outbox` bullet in Architecture below) instead, closing the gap where a
  broker outage or a crash between commit and publish used to lose the event silently (`EventPublisher`'s
  contract is "must not throw," so nothing surfaced that loss). A separate relay worker (`npm run
  worker:outbox-relay`) polls that table and is the only thing that actually publishes to RabbitMQ, consumed
  in turn by another standalone worker (`npm run worker:account-created`) that simulates sending a
  confirmation email. A task-queue-shaped job — one event, one consumer, no replay needed.
- **Kafka**: `SendRemittanceUseCase` publishes `remittance.completed` after its transaction commits, consumed
  by a standalone worker (`npm run worker:remittance-indexer`) that indexes it into Elasticsearch. An
  event-stream-shaped job instead — a business fact a consumer group can replay, chosen over RabbitMQ for
  that reason (see the `EventPublisher` bullet in Architecture below for the full reasoning).
- **Elasticsearch**: backs `GET /remittances` only (`SearchRemittancesUseCase`, CQRS read side) — a
  denormalized, eventually-consistent projection kept in sync by the Kafka consumer above, never the
  destination of a write path itself. `RemittanceRepository` (Postgres) remains the source of truth; this
  index can lag or, if Elasticsearch is down when a request comes in, error — GET /remittances is the only
  thing that depends on it.
- **Mongo**: backs `POST /kyc`'s dossier archive only (`MongoKycDossierRepository`, see the `EventPublisher`
  sibling note below) — the raw submitted material (documents, notes), never the `KycProfile` status
  `ComplianceChecker` actually reads (that's Postgres). Everything else (account/wallet/remittance) still
  doesn't touch Mongo.

## Commands

There is no `node_modules` installed in this environment — run `bun install` or `npm install` first.

```bash
bun install              # or npm install

npm test                 # run all tests (jest)
npm test -- <pattern>    # run a subset, e.g. npm test -- create-account
npm run test:watch
npm run test:coverage

npm run test:integration  # Cucumber (see "Integration tests" below) — needs a reachable, migrated Postgres

npm run lint             # eslint src --ext .ts
npm run lint:fix
npm run format           # prettier --write src/**/*.ts
npm run format:check

npm start                # nodemon --exec bun run src/main/server.ts
npm run dev               # ts-node src/main/server.ts
npm run dev:watch

npm run db:migrate        # applies migrations/001_init_schema.sql + 002_seed_treasury_wallets.sql +
                           # 003_create_outbox_events.sql

npm run worker:account-created # separate process: consumes account.created from RabbitMQ, simulates
                                # sending a confirmation email (see the Architecture EventPublisher bullet)

npm run worker:remittance-indexer # separate process: consumes remittance.completed from Kafka, indexes
                                   # it into Elasticsearch for GET /remittances

npm run worker:outbox-relay # separate process: polls Postgres outbox_events and publishes unpublished
                             # rows to RabbitMQ (see the Architecture Transactional Outbox bullet) —
                             # account.created only reaches worker:account-created's queue via this

docker compose up --build # app + Postgres + Redis + RabbitMQ + Kafka + Elasticsearch + all three workers
                           # above, in containers (see "Docker" below); no local install needed
```

A single test file: `npm test -- __tests__/domain/entities/account.test.ts`.

Copy `.env.example` to `.env` before running the server; it needs `JWT_SECRET`, `POSTGRES_HOST`/
`POSTGRES_PORT`/`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DATABASE`, `REDIS_HOST`/`REDIS_PORT`/
`REDIS_PASSWORD` (password optional — unset unless the Redis you're pointing at actually requires one),
`RABBITMQ_HOST`/`RABBITMQ_PORT`/`RABBITMQ_USER`/`RABBITMQ_PASSWORD`, `KAFKA_BROKERS`/`KAFKA_CLIENT_ID`,
`ELASTICSEARCH_URL`, `MONGO_HOST`/`MONGO_PORT`/`MONGO_USER`/`MONGO_PASSWORD`/`MONGO_DATABASE`. Postgres and
Redis must both be reachable before `npm run dev`/`npm start`/either `worker:*` script — run `npm run
db:migrate` once (idempotent, safe to re-run) against a fresh Postgres database first; the server exits
immediately if either connection check fails (see "What this is" above). RabbitMQ/Kafka/Elasticsearch/Mongo
all degrade non-fatally if unreachable rather than blocking boot (see "What this is" above for exactly what
each backs). `npm test` needs none of this — it never touches Postgres, Redis, RabbitMQ, Kafka,
Elasticsearch, or Mongo. Every config module that reads `process.env.*` (`pg.ts`, `redisClient.ts`,
`rabbitmq-connection.ts`, `kafka-connection.ts`, `elasticsearch-client.ts`, `mongo-database.ts`) calls
`dotenv.config()` itself at import time — don't assume an entrypoint has already loaded `.env` before
importing one; skipping this bit the `worker:account-created` script once (RabbitMQ env vars read as
`undefined`, connection fell back to `guest:guest@localhost` and failed auth) before
`rabbitmq-connection.ts` got its own `dotenv.config()` call, matching `pg.ts`'s existing pattern. Also
separately: `mongo-database.ts` used to read `MONGO_HOST` directly as if it were a full connection string
and `MONGO_DB` for the database name — neither var existed anywhere (`.env.example` had `MONGO_URI`;
`.env` conventionally has `MONGO_HOST` as a bare hostname plus `MONGO_DATABASE`) — now fixed to build the
connection string from `MONGO_HOST`/`MONGO_PORT`/`MONGO_USER`/`MONGO_PASSWORD` and read `MONGO_DATABASE`,
matching the HOST/PORT/USER/PASSWORD convention every other service here uses. Observability vars
(`LOG_LEVEL`, `LOKI_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`) are optional — an unreachable
Loki/Tempo degrades gracefully rather than blocking boot (see "Observability" below).

### Docker

`docker compose up --build` runs nine services: `postgres`, `redis`, `rabbitmq`, `kafka`, `elasticsearch`,
`app`, `worker-account-created`, `worker-remittance-indexer`, and `worker-outbox-relay`. Mongo is the one
intentionally left out —
nothing in the current request path *requires* it (see "What this is" above: `POST /kyc` degrades to
"dossier not archived" without it, same as RabbitMQ/Kafka/Elasticsearch degrade without theirs), so it isn't
simulated just because `.env.example` lists it. `docker-entrypoint.sh` runs `npm run db:migrate` before
starting the server on every container start, so no manual migration step is needed with this path. The
`app` service builds from the repo's `Dockerfile` (multi-stage, `ts-node` + `tsconfig-paths` at runtime — no
separate `tsc` build step, since several files import via the `src/...` baseUrl alias that plain compiled JS
wouldn't resolve); all three `worker-*` services reuse the same image but override `entrypoint:` to run
their consumer/relay script directly, bypassing `docker-entrypoint.sh` (which always runs migrations + the
HTTP server regardless of `CMD`, so it can't be reused for a different process as-is). `app` depends on
`postgres` and `redis` being healthy before starting (both are fatal-if-unreachable, see "What this is"
above) but only on `rabbitmq`/`kafka`/`elasticsearch` having *started* — not healthy — since all three are
non-fatal and shouldn't hold up boot. `worker-outbox-relay` is the one worker that also depends on
`postgres` being *healthy* (not just started, unlike the other two workers) — it polls `outbox_events`
directly, the same table `CreateAccountUseCase` writes to, so it needs a real, migrated Postgres to have
anything to read.

Host-side ports default away from each service's standard port (`6380` not `6379`, `5673`/`15673` not
`5672`/`15672`, `9094` not `9092`, `9201` not `9200`) so `docker compose up` here doesn't collide with a
same-named service you might already have running elsewhere on the host (e.g. a separate local dev
stack) — the app always talks to these over the compose network on their standard ports regardless
(`postgres:5432`, `redis:6379`, `rabbitmq:5672`, `kafka:29092` — not `kafka:9092`, that listener is only
advertised for host-side clients outside the compose network — and `elasticsearch:9200`). Postgres alone
predates this convention with its own non-standard host port (`localhost:55432`), for the same reason. This
is still a deliberately minimal setup, not the multi-node NGINX + full-stack one the README describes — see
the next bullet in "Known inconsistencies" for that gap.

## Architecture

Clean Architecture with dependency rule "dependencies point inward." Each layer lives under `src/`,
organized **by layer first, then by bounded context** (`user`, `account`, `wallet`, `ledger`, `exchange`,
`compliance`, `remittance`):

- **`user` vs `account`**: `User` is the identity/authentication aggregate (email + password hash);
  `Account` is the financial/ledger relationship that `Wallet`, `Remittance`, and `KycProfile` actually
  reference by id, and deliberately carries no credentials. `Account.userId` is nullable because not
  every account has a human owner — the system treasury account (`domain/wallet/treasury-account.ts`) is
  an `Account` with no `User` at all. `CreateAccountUseCase` (behind `POST /account`) provisions one of
  each per signup — it's one HTTP action, but two aggregates. `LoginUseCase` (behind `POST /login`) is the
  other consumer: it authenticates a `User` by email/password (`PasswordHasher.compare`), resolves that
  user's `Account` via `AccountRepository.findByUserId`, and mints a JWT embedding both ids. This split
  used to not exist: `Account` carried a `password` field directly, which is exactly why the treasury
  account previously needed a throwaway fake password just to satisfy the entity's constructor, and why
  there was no login endpoint at all (fixed history in "Previously-documented bugs" below).

```
src/
 ├── domain/<context>/         entities, value-objects, repository interfaces (ports) — no framework deps
 │    ├── ledger/services/     LedgerService — first domain service in the codebase (needs a port, LedgerRepository)
 │    └── shared/              cross-context domain: Clock, errors.ts, Money/Currency value objects
 ├── application/<context>/    use cases + DTOs, orchestrate domain objects (now includes compliance/ —
 │    │                        SubmitKycUseCase, dto/, and its own repositories/ for KycDossierRepository,
 │    │                        the first context-scoped repositories/ folder alongside the top-level one)
 │    ├── repositories/        ports the application layer depends on (e.g. IdempotencyRepository)
 │    └── shared/              cross-cutting ports: authentication, idempotency, security, exchange, compliance,
 │                              pricing, transaction (UnitOfWork), events (EventPublisher)
 ├── infra/                    concrete adapters implementing domain/application ports
 │    ├── authentication/      JWTService (implements TokenGenerator + TokenVerifier)
 │    ├── config/database/     Postgres pool (+ transaction context, see below), Mongo singleton, Redis
 │    │                        client, Elasticsearch client (Strategy pattern via DatabaseStrategy/
 │    │                        DatabaseContext — Mongo only, see below) — pg.ts, redisClient.ts,
 │    │                        elasticsearch-client.ts, mongo-database.ts, and message-broker/{rabbitmq,
 │    │                        kafka}-connection.ts all call dotenv.config() themselves; see Commands
 │    ├── config/message-broker/ rabbitmq-connection.ts and kafka-connection.ts — the real, used connection
 │    │                        modules. rabbitmq-connection.ts's siblings rabbitmq-producer.ts/
 │    │                        rabbitmq-consumer.ts are dead, pre-pivot leftovers that don't even compile
 │    │                        (import domain/transaction/... paths that no longer exist) — the actual
 │    │                        producer/consumers live in events/ below, not here
 │    ├── events/               EventPublisher adapters: InMemoryEventPublisher (records published events,
 │    │                        used in tests), RabbitMQEventPublisher + KafkaEventPublisher (real — never
 │    │                        throw, log+swallow their own connect/publish failures; see the EventPublisher
 │    │                        bullet below for which use case gets which — RabbitMQEventPublisher itself is
 │    │                        currently unused by any factory, see the Transactional Outbox bullet).
 │    │                        consumers/ holds three separate long-running processes — account-created-
 │    │                        consumer.ts (npm run worker:account-created), remittance-completed-indexer.ts
 │    │                        (npm run worker:remittance-indexer), and outbox-relay.ts (npm run
 │    │                        worker:outbox-relay) — none is part of buildApp()
 │    ├── observability/       logger.ts (Pino), metrics.ts (prom-client), tracing.ts (OpenTelemetry) — see below
 │    ├── compliance/          InMemoryComplianceChecker — fixed threshold rule, mocked
 │    ├── exchange/            MockExchangeRateProvider — static rate table, mocked
 │    ├── pricing/             FlatPercentageFeeCalculator — mocked
 │    ├── factories/           wire concrete adapters into a use case (e.g. account-factory.ts, remittance-factory.ts)
 │    ├── persistence/         postgresql/ (the repos every factory wires to for everything except
 │    │                        idempotency, plus postgres-registry.ts, postgres-unit-of-work.ts,
 │    │                        postgres-outbox-repository.ts — see the Transactional Outbox bullet below —
 │    │                        and migrations/), redis/ (RedisIdempotencyRepository + redis-registry.ts —
 │    │                        what account/wallet/remittance/kyc factories wire idempotencyRepository to
 │    │                        instead, see the Idempotency bullet below), elasticsearch/
 │    │                        (ElasticsearchRemittanceSearchIndex — GET /remittances's read model),
 │    │                        mongodb/ (MongoKycDossierRepository — POST /kyc's dossier archive, the first
 │    │                        real Mongo consumer in this codebase), in-memory/ (what tests construct
 │    │                        directly instead — in-memory-registry.ts, in-memory-unit-of-work.ts,
 │    │                        in-memory-outbox-repository.ts)
 │    ├── security/            BcryptPasswordHasher
 │    └── time/                SystemClock
 ├── interfaces/http/          Express-facing layer: controllers, routes, middlewares
 └── main/                     composition root: server.ts bootstraps Express + DI; <context>-module.ts
                                (e.g. account-module.ts, wallet-module.ts, remittance-module.ts,
                                compliance-module.ts) builds a use case from injected dependencies
```

Key patterns to follow when extending this code:

- **Use cases** implement `UseCase<Input, Output>` (`src/application/shared/idempotency/common-use-case..ts`
  — note the trailing dot in the filename, that's intentional/existing, not a typo to "fix" in isolation).
- **Idempotency** is applied via decorator, not baked into use cases: `IdempotentDecorator<I, O>` wraps a
  `UseCase` and an `IdempotencyRepository`, short-circuiting on a previously-seen `input.idempotencyKey`.
  Module builders (`src/main/<context>/<context>-module.ts`) compose the raw use case with this decorator.
  Controllers are responsible for supplying `idempotencyKey` on the input (from an `Idempotency-Key`
  header, falling back to a freshly generated UUID per request if absent — never a shared constant, or
  every keyless request would collide on the same cache entry). Note `InMemoryIdempotencyRepository
  .findByKey` resolves to the cached **response value directly** (see its test), not a wrapping
  `{key, response}` record — `IdempotentDecorator` reads it as `existing as O`, not `existing.response`.
  `account-factory.ts`/`wallet-factory.ts`/`remittance-factory.ts`/`compliance-factory.ts` wire
  `idempotencyRepository` to `RedisIdempotencyRepository` (`infra/persistence/redis/`) now, not Postgres:
  `claim()` is `SET key
  IN_FLIGHT NX EX <30s>` (the same atomic reservation the Postgres adapter gets from its `UNIQUE`
  constraint), `save()` overwrites with the response under a 24h TTL, and `release()` uses a Lua
  check-and-delete script so it can never clobber a response a concurrent `save()` already wrote.
  `PostgresIdempotencyRepository` still exists and is still correct, just unused by any factory now — it
  was the load-bearing implementation before this switch.
- **Entities** are plain classes with private fields, `get*()` accessors, and no setters (immutable-style).
  IDs and enums are value objects (`AccountId`, `AccountStatus`, `WalletId`, `EntryDirection`, ...) with
  private constructors and static factories (`.generate()`, `.from()`), not raw strings/numbers. Entities
  that get mutated (e.g. `Wallet.credit()`/`.debit()`) return a **new** instance rather than mutating in place.
- **Money** is always an integer count of minor units (`Money.fromMinorUnits`, `domain/shared/value-objects/
  money-value-object.ts`) — never a float — paired with a `Currency` value object validated against a small
  static registry. Direction (debit/credit) is expressed separately via `EntryDirection`, not via sign.
- **DTOs** (e.g. `CreateAccountInput`/`Output`, `SendRemittanceInput`/`Output`) are plain classes with a
  static `.from(...)` mapper; output DTOs map from a domain entity, input DTOs map from a raw
  request-shaped object.
- **Wiring order**: domain port → application use case (depends on port interfaces only) → infra adapter
  (implements the port) → factory in `infra/factories/` (constructs adapters + calls a `main/.../*-module.ts`
  builder) → `main/server.ts` (calls the factory, injects into a controller/router).
- **Every `*-factory.ts` wires to `infra/persistence/postgresql/postgres-registry.ts`** for everything
  except idempotency — one shared instance of each `Postgres*Repository` (each takes no constructor args;
  they call a shared `getExecutor()` helper from `config/database/postgresql/pg.ts` per query instead of
  holding injected state). `idempotencyRepository` is the one exception: it comes from
  `infra/persistence/redis/redis-registry.ts` instead (see the Idempotency bullet above).
  `infra/persistence/in-memory/in-memory-registry.ts` is the parallel in-memory equivalent, kept in
  sync in shape but **not imported by any factory or test** — every use-case test constructs its own
  `InMemory*Repository` instances directly (see "Tests mirror..." below), so the in-memory registry itself
  is currently unused scaffolding, kept only as the in-memory stack's one obvious entry point.
- **`UnitOfWork`** (`application/shared/transaction/unit-of-work.ts`) wraps a sequence of repository writes
  in one atomic unit. `SendRemittanceUseCase` is the one consumer today — its whole `execute()` body runs
  inside `unitOfWork.runInTransaction(...)`, so a failure partway through (after some but not all of its
  wallet/ledger/remittance saves) rolls back everything instead of leaving a partial posting.
  `PostgresUnitOfWork` (`infra/persistence/postgresql/postgres-unit-of-work.ts`) does a real
  `BEGIN`/`COMMIT`/`ROLLBACK`, publishing the transaction's `PoolClient` via an `AsyncLocalStorage`
  (`transactionContext` in `pg.ts`) so every `Postgres*Repository` call made during the callback picks it
  up transparently through `getExecutor()` — no `client` parameter threaded through repository method
  signatures. `InMemoryUnitOfWork` is a no-op passthrough (`return work()`), which is why this changed
  nothing about how tests exercise `SendRemittanceUseCase`. Not implemented: `SELECT ... FOR UPDATE` row
  locking on the wallet reads inside the transaction — atomicity (all-or-nothing) is guaranteed, but not
  concurrent-debit race safety, which would need it.
- **Transactional Outbox** (`application/shared/events/outbox-repository.ts`, the `OutboxRepository` port)
  solves a gap plain `EventPublisher` calls have: publishing to a broker directly, even right after a
  transaction commits, is two unrelated operations against two different systems — a broker outage, or a
  process crash in the exact window between the commit and the publish call, silently loses the event, and
  `EventPublisher`'s own "must not throw" contract (see below) means nothing ever surfaces that loss.
  `CreateAccountUseCase` is the one consumer today: instead of publishing `account.created` to RabbitMQ
  itself, it calls `outboxRepository.add('account.created', payload)` from *inside* `doExecute()` — i.e.
  inside the same `unitOfWork.runInTransaction(...)` call as the `User` + `Account` saves — so the write to
  `outbox_events` (`migrations/003_create_outbox_events.sql`) either commits together with the signup or
  rolls back together with it; there's no window where one exists without the other.
  `PostgresOutboxRepository` (`infra/persistence/postgresql/`) does a plain `INSERT`/`SELECT`/`UPDATE`
  through the shared `getExecutor()`, same as every other `Postgres*Repository` — that's what makes `add()`
  transparently join whatever transaction is in flight. A separate relay process
  (`infra/events/consumers/outbox-relay.ts`, `npm run worker:outbox-relay`) polls `outbox_events` for
  unpublished rows (default every 5s, `OUTBOX_RELAY_INTERVAL_MS`) and is the only thing that actually calls
  RabbitMQ for these — deliberately *not* via `RabbitMQEventPublisher` (its swallow-and-log contract is
  exactly wrong for a relay whose whole job is to notice a failed publish and retry it); a failed publish
  just leaves the row unpublished for the next poll, no separate retry/backoff bookkeeping. `InMemoryOutboxRepository`
  is the test fake, mirroring the rest of the in-memory stack. `SendRemittanceUseCase`/`remittance.completed`
  does **not** go through the outbox — see the `EventPublisher` bullet below for why that gap is judged
  acceptable there (Kafka's own retention already gives it a different safety net a task-queue event like
  `account.created` doesn't have).
- **`EventPublisher`** (`application/shared/events/event-publisher.ts`) publishes a domain event — a topic
  string + a plain payload — with a contract deliberately weaker than `UnitOfWork`'s: implementations
  **must not throw**. Every event published through it is a best-effort side effect, not a correctness
  guarantee — unlike a ledger write, losing one occasionally is acceptable. Two producers exist, each on a
  different broker, deliberately — the broker is picked per event based on how it's meant to be consumed,
  not "whichever queue already exists":
    - `CreateAccountUseCase` → `account.created`, now via the Transactional Outbox above rather than a
      direct `publish()` call — `RabbitMQEventPublisher` itself is unused by any factory today, kept only
      as a correct, generic `EventPublisher` adapter (see its own file comment). Task-queue-shaped: one
      event, one consumer (the simulated-email worker), no reason to replay it later — which is also why
      only this one got the outbox treatment and `remittance.completed` below didn't.
    - `SendRemittanceUseCase` → `remittance.completed` (after `unitOfWork.runInTransaction()` resolves — see
      the `UnitOfWork` bullet above; published outside the transaction on purpose, so a remittance that ends
      up rolled back can never have already announced itself as completed) → `KafkaEventPublisher`.
      Event-stream-shaped: a business fact a consumer group can replay, and plausibly more than one
      consumer wants over time (today: the Elasticsearch indexer; analytics/audit are the obvious next
      ones) — Kafka's retention/replay model fits that, RabbitMQ's work-queue model doesn't.

  Both adapters (`infra/events/`) catch and log their own connect/publish failures rather than propagating
  them; `InMemoryEventPublisher` is the test/fake counterpart (records published events in an array).
  `SendRemittanceUseCase` takes its `EventPublisher` as a required constructor arg, same as it takes its
  `UnitOfWork` — no default, so every construction site (factory, test) is explicit about which adapter it's
  using; `CreateAccountUseCase` takes an `OutboxRepository` in that same required-constructor-arg slot
  instead now (see the Transactional Outbox bullet above). Three separate consumer/relay processes exist in
  `infra/events/consumers/`, none part of `buildApp()`:
    - `account-created-consumer.ts` (`npm run worker:account-created`) logs a simulated "confirmation email
      sent" line per event and acks.
    - `remittance-completed-indexer.ts` (`npm run worker:remittance-indexer`) indexes each event into
      Elasticsearch via `ElasticsearchRemittanceSearchIndex` (`infra/persistence/elasticsearch/`) — catches
      and logs its own indexing failures rather than crashing the consumer (same best-effort posture as
      `EventPublisher` itself), so a bad message is dropped, not retried forever.
    - `outbox-relay.ts` (`npm run worker:outbox-relay`) is the producer side of the pair above — see the
      Transactional Outbox bullet.

  `GET /remittances` (`SearchRemittancesUseCase`) is the CQRS read side these two feed: it reads from
  Elasticsearch only, never Postgres, via `RemittanceSearchIndex`
  (`application/remittance/repositories/remittance-search-index.ts`) — a **different** contract than
  `EventPublisher`'s: `search()` is allowed to throw (a failed search should surface as a real error, there's
  no meaningful silent-empty-result), unlike `publish()`. The index/mapping (`remittances`, all string
  fields `keyword`, `createdAt` a `date`) is created lazily on first `index()`/`search()` call — no formal
  migration runner for it, unlike Postgres. `accountId` is a required query param on the HTTP side (matches
  either sender or recipient) — there's no per-resource authorization layer yet (see below), so requiring it
  at least stops the endpoint from defaulting to "every remittance in the system."
- **Observability** (`infra/observability/`): `logger.ts` is a single shared Pino logger, replacing scattered
  `console.*` calls across `infra/config/**` — always logs pretty to stdout, and additionally ships
  structured logs to Loki when `LOKI_URL` is set; Pino transports run in worker threads and `pino-loki`
  reports its own push failures to stderr instead of throwing, so an unreachable Loki degrades to
  stdout-only logging rather than crashing the app. `metrics.ts` registers Prometheus default Node metrics
  plus generic RED metrics (`http_request_duration_seconds`, `http_requests_total`) via
  `httpMetricsMiddleware`, exposed on `GET /metrics` — unauthenticated, like `GET /health`, since the
  Prometheus scraper carries no JWT — for Prometheus to scrape directly (no push). `tracing.ts` bootstraps
  OpenTelemetry auto-instrumentation exporting OTLP/HTTP traces to Tempo; it's imported as the very first
  line of `src/main/server.ts`, ahead of every other import, because auto-instrumentation monkey-patches
  modules (express, http, pg, ...) at `require()` time and has to run before anything it instruments gets
  imported. Like Mongo/RabbitMQ/Kafka/Elasticsearch (see below), a failed/unreachable Loki or Tempo is
  non-fatal — only the Postgres and Redis checks inside `buildApp()` block boot.
- **Cross-currency ledger balancing**: a single transaction can't balance directly across two currencies.
  System-owned **treasury wallets** (one per supported currency, owned by the reserved
  `TREASURY_ACCOUNT_ID` in `domain/wallet/treasury-account.ts`, seeded via `seed-treasury-wallets.ts`) act
  as the FX/fee counterparty, so every currency's legs net to zero independently. `LedgerService
  .postBalancedEntries()` (`domain/ledger/services/ledger-service.ts`) enforces this per-currency-zero-sum
  invariant before persisting. See `SendRemittanceUseCase` for the exact leg layout (principal + fee legs
  in the source currency, settlement legs in the destination currency; a same-currency shortcut skips
  treasury for the principal and routes only the fee through it).
- Mongo access uses a **Strategy pattern**: `DatabaseStrategy<T>` interface (`connect`/`disconnect`) with
  `DatabaseContext` as the (currently unused) strategy holder; see `mongo-database-sigleton.ts` for the
  actual Mongo singleton usage (filename typo is existing, not yet renamed) — it calls `MongoDatabase
  .connect()` directly, not through `DatabaseContext`. Mongo connection failure at startup is logged, not
  fatal — account/wallet/remittance still don't touch it; `POST /kyc`'s dossier archive
  (`MongoKycDossierRepository`, see the `EventPublisher` bullet's sibling note above) is the first thing
  that does, and it degrades the same way (dossier not archived, KycProfile save in Postgres unaffected).
  Postgres deliberately does **not**
  follow this pattern: `pg.ts` exports a bare `pool` (`pg.Pool` already manages its own connection
  lifecycle) plus a `getExecutor()` helper for transaction-awareness (see the `UnitOfWork` bullet above) —
  no `PostgresDatabase implements DatabaseStrategy<Pool>` wrapper exists, since nothing needed the
  connect/disconnect abstraction Mongo's version provides. `server.ts` fails fast if Postgres isn't
  reachable at boot (`pool.query('SELECT 1')`, `process.exit(1)` on failure) and closes the pool on
  `SIGTERM`/`SIGINT` — the first graceful-shutdown hooks in this codebase.
- Tests mirror `src/`'s path structure under `__tests__/` (e.g. `src/domain/account/entities/account.ts` →
  `__tests__/domain/entities/account.test.ts`) and prefer `InMemory*` repository fakes over mocking
  frameworks for use-case tests.
- **Integration tests** live under `features/` and run on Cucumber (`cucumber.js`, `npm run test:integration`),
  separate from Jest's unit suite. They exercise the real Express app end to end over HTTP against a real
  Postgres — no in-memory repos, no mocking. `src/main/server.ts` exports `buildApp()` (Express wiring minus
  `app.listen`) specifically so `features/support/hooks.ts` can build the same app the CLI entrypoint does,
  bind it to an ephemeral port once per suite run (`BeforeAll`/`AfterAll`), and tear it down cleanly —
  `startServer()` itself is now guarded behind `require.main === module` so importing `buildApp` doesn't
  also boot a second server on the fixed `PORT`. Because this suite writes to a real, non-rolled-back
  database, step definitions generate a unique email per scenario (`accounts`/`users` has a `UNIQUE`
  constraint on email) rather than reusing a fixed fixture. Needs `npm run db:migrate` run first, same as
  `npm run dev`/`npm start`; unlike `npm test`, this suite does touch Postgres for real.

## Known inconsistencies (check before relying on these paths)

- `README.md` still largely describes the pre-pivot account/ledger framing (and a `src/infrastructure/` /
  `src/domain/entities|value-objects|repositories` layout that never matched the real tree, which uses
  `src/infra/` and per-context subfolders like `src/domain/account/entities/...`). Its title/intro was
  updated for the cross-border pivot; the rest was not. Trust this file and the actual tree over the
  README's body.
- Postgres persistence is functional (`account-factory.ts`, `wallet-factory.ts`, `remittance-factory.ts`,
  `user-factory.ts`, `compliance-factory.ts` all wire to `postgres-registry.ts` for everything except
  idempotency — see Architecture above); Mongo persistence is now functional too, but narrowly — only
  `MongoKycDossierRepository` touches it (see the `EventPublisher`/Mongo bullets above); nothing else does.
  `npm test` uses the `InMemory*` implementations directly, never Postgres, Redis, RabbitMQ, Kafka,
  Elasticsearch, or Mongo.
- A `docker-compose.yml` now covers Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, the app, and both
  `worker-*` services (see "Docker" above), but it's still not the multi-node NGINX load balancing + Mongo
  stack the README's "Running Locally" section describes — that fuller setup (NGINX, multiple API
  instances, Mongo as a compose service) is still not present in the repo (Mongo runs outside Docker for
  this project, whatever `MONGO_HOST`/etc. in `.env` point at). Outside Docker, every one of
  Postgres/Redis/RabbitMQ/Kafka/Elasticsearch/Mongo is whatever its own `*_HOST`/etc. vars in `.env` point
  at, started/managed outside this repo.
- The compliance/KYC gate (`InMemoryComplianceChecker` — the name is legacy, it's a mocked business-rule
  checker, not an in-memory *store*; it takes whatever `KycProfileRepository` it's constructed with, and is
  wired to the Postgres one via `remittance-factory.ts`) now has an HTTP submit endpoint (`POST /kyc`, see
  the `EventPublisher` bullet's Mongo sibling note above) — this used to be a documented gap ("no HTTP
  submit/verify endpoint... a KycProfile can only be marked VERIFIED by saving one directly through
  KycProfileRepository") and no longer is. `SubmitKycUseCase` auto-verifies every submission synchronously
  rather than calling a real KYC provider — same mocked-and-immediate spirit as `MockExchangeRateProvider`/
  `InMemoryComplianceChecker` itself; there's still no separate async "verify" step or a way to reject a
  submission. Below the fixed unverified-sender threshold, remittances still work without submitting KYC at
  all.
- FX rates (`MockExchangeRateProvider`) are a static table, not a live feed; the compliance threshold is
  applied in raw source-currency minor units, not FX-normalized; and treasury wallets are seeded once with
  a large fixed balance (`migrations/002_seed_treasury_wallets.sql`) rather than continuously rebalanced —
  documented, deliberate simplifications for this showcase, not oversights. (`SendRemittanceUseCase`'s
  writes *are* now wrapped in a real transaction — see the `UnitOfWork` bullet in Architecture above; that
  used to be on this list as a known gap and no longer is.)

Previously-documented bugs that are now fixed (kept here as history in case behavior looks unfamiliar):
the account controller's wrong import path and no-argument `execute()` call, the account router being
built but never mounted, `IdempotentDecorator` reading `existing.response` when
`InMemoryIdempotencyRepository.findByKey` actually resolves to the response value directly (silently
returned `undefined` on every idempotency cache hit until fixed), and `pg.ts` reading `POSTGRE_*`
(missing the S) while `.env`/`.env.example` defined `POSTGRES_*` — `pg.ts` now reads `POSTGRES_*`,
matching `.env.example`. (At the time this was fixed, nothing wired to `pool` yet either way — now
everything does, see below.) Also: `Account` used to double as the identity/auth
aggregate (it carried a `password` field directly), which meant the system treasury account had to be
given a throwaway fake password just to satisfy the entity — `User` is now its own domain (see the
`user` vs `account` note in "Architecture" above), `Account.userId` is nullable, and the treasury account
is seeded with `userId: null` / `user_id: NULL` instead. And: there used to be no HTTP login/
token-issuance endpoint at all, so `/wallets`/`/remittances` needed a JWT minted directly via
`jwt.sign(payload, process.env.JWT_SECRET)` for manual testing — `POST /login` (`LoginUseCase`, see
`application/user/uses-cases/login-use-case.ts`) now does this for real, checking email/password via
`PasswordHasher.compare` and returning a normal server-issued token. Also: every `Postgres*Repository`
used to be a stub and every `*-factory.ts` wired to the in-memory registry regardless — the app now
requires and uses real Postgres (see "What this is" and the Architecture bullets above); only `npm test`
still runs against the in-memory repos. Also: `redisClient.ts` and `rabbitmq-connection.ts` both used to
read `process.env.*` without ever calling `dotenv.config()` themselves, relying on their entrypoint having
loaded `.env` first — `server.ts` happened to (via an earlier import in the same chain, for Redis), but the
standalone `worker:account-created` script didn't, so `RABBITMQ_HOST`/etc. silently read as `undefined`
until `rabbitmq-connection.ts` got its own `dotenv.config()` call, matching `pg.ts`'s existing pattern (see
Commands above); `redisClient.ts` got the same fix preemptively, since it only worked by the same kind of
import-order luck. And: `mongo-database.ts` used to pass `process.env.MONGO_HOST` straight to `new
MongoClient(...)` as if it were a full connection string, and read `process.env.MONGO_DB` for the database
name — neither var existed anywhere (see the Mongo bug note above) — fixed to build the connection string
from `MONGO_HOST`/`MONGO_PORT`/`MONGO_USER`/`MONGO_PASSWORD` and read `MONGO_DATABASE`, matching every other
service's HOST/PORT/USER/PASSWORD convention. Both were non-fatal, so both were silently broken rather than
loudly, for a while.

See `JWT_IMPLEMENTATION.md` for the JWT auth flow in detail (`JWTService.generate`/`verify`,
`authMiddleware`, `createJWTService()` factory) if working on authentication.