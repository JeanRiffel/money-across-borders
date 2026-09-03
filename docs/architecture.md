# Architecture

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
  there was no login endpoint at all (fixed history in [known-issues.md](known-issues.md)).

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
 │    │                        kafka}-connection.ts all call dotenv.config() themselves; see
 │    │                        [infrastructure.md](infrastructure.md)
 │    ├── config/message-broker/ rabbitmq-connection.ts and kafka-connection.ts — the real, used connection
 │    │                        modules, plus rabbitmq-retry-topology.ts (the account.created retry/DLQ queue
 │    │                        topology — see the Resilience bullet below). rabbitmq-connection.ts's other
 │    │                        siblings rabbitmq-producer.ts/rabbitmq-consumer.ts are dead, pre-pivot
 │    │                        leftovers that don't even compile (import domain/transaction/... paths that
 │    │                        no longer exist) — the actual producer/consumers live in events/ below, not here
 │    ├── events/               EventPublisher adapters: InMemoryEventPublisher (records published events,
 │    │                        used in tests), RabbitMQEventPublisher + KafkaEventPublisher (real — never
 │    │                        throw, log+swallow their own connect/publish failures; see the EventPublisher
 │    │                        bullet below — both are currently unused by any factory, see the Transactional
 │    │                        Outbox bullet). consumers/ holds four separate long-running processes —
 │    │                        account-created-consumer.ts (npm run worker:account-created — see the
 │    │                        Resilience bullet below for its retry/DLQ/idempotency behavior),
 │    │                        remittance-completed-indexer.ts (npm run worker:remittance-indexer),
 │    │                        outbox-relay.ts (npm run worker:outbox-relay, RabbitMQ), and
 │    │                        kafka-outbox-relay.ts (npm run worker:outbox-relay-kafka, Kafka) — none is
 │    │                        part of buildApp()
 │    ├── observability/       logger.ts (Pino), metrics.ts (prom-client), tracing.ts (OpenTelemetry) — see below
 │    ├── resilience/           timeout/retry/backoff/circuit-breaker for synchronous external-provider
 │    │                        calls — see the Resilience bullet below and [resilience.md](resilience.md)
 │    ├── compliance/          InMemoryComplianceChecker — fixed threshold rule, mocked
 │    ├── exchange/            MockExchangeRateProvider (static rate table, mocked, still the default) and
 │    │                        HttpExchangeRateProvider (real HTTP call through resilience/, opt-in via
 │    │                        FX_PROVIDER=http) — see the Resilience bullet below
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
  `CreateAccountUseCase` and `SendRemittanceUseCase` are both consumers today: instead of publishing
  directly, each calls `outboxRepository.add(topic, payload, broker)` from *inside* `doExecute()` — i.e.
  inside the same `unitOfWork.runInTransaction(...)` call as its own business-row saves — so the write to
  `outbox_events` (`migrations/003_create_outbox_events.sql`, `005_add_outbox_broker_column.sql`) either
  commits together with the business write or rolls back together with it; there's no window where one
  exists without the other. `broker` (`'rabbitmq' | 'kafka'`, defaulting to `'rabbitmq'` on both `add()` and
  `findUnpublished()`) is what lets one `outbox_events` table serve both: `CreateAccountUseCase`'s
  `outboxRepository.add('account.created', payload)` call doesn't pass it at all (default applies) and
  `SendRemittanceUseCase` passes `'kafka'` explicitly. `PostgresOutboxRepository`
  (`infra/persistence/postgresql/`) does a plain `INSERT`/`SELECT`/`UPDATE` through the shared
  `getExecutor()`, same as every other `Postgres*Repository` — that's what makes `add()` transparently join
  whatever transaction is in flight.

  Two separate relay processes exist, one per broker, deliberately kept as independent code rather than one
  parameterized relay, so each can evolve its own retry/batching/backoff shape without the two brokers'
  concerns entangled together — they only ever share the `outbox_events` table itself, scoped by `broker` so
  neither ever claims a row the other owns:
    - `infra/events/consumers/outbox-relay.ts` (`npm run worker:outbox-relay`, polls every 5s by default,
      `OUTBOX_RELAY_INTERVAL_MS`) — `findUnpublished(limit)` (implicit `'rabbitmq'`), calls RabbitMQ.
    - `infra/events/consumers/kafka-outbox-relay.ts` (`npm run worker:outbox-relay-kafka`, polls every 5s by
      default, `KAFKA_OUTBOX_RELAY_INTERVAL_MS`) — `findUnpublished(limit, 'kafka')`, calls Kafka.

  Both talk to their broker directly (`connectRabbitMQ()` / `getKafkaProducer()`) rather than through
  `RabbitMQEventPublisher`/`KafkaEventPublisher` — those adapters' swallow-and-log contract is exactly wrong
  for a relay whose whole job is to notice a failed publish and retry it; a failed publish just leaves the
  row unpublished for the next poll, no separate retry/backoff bookkeeping beyond that. `InMemoryOutboxRepository`
  is the test fake, mirroring the rest of the in-memory stack (its `findUnpublished` filters by `broker` too).
- **`EventPublisher`** (`application/shared/events/event-publisher.ts`) publishes a domain event — a topic
  string + a plain payload — with a contract deliberately weaker than `UnitOfWork`'s: implementations
  **must not throw**. It's what the Transactional Outbox above exists to route around for both events this
  codebase produces today — `RabbitMQEventPublisher` and `KafkaEventPublisher` are both unused by any
  factory now, kept only as correct, generic `EventPublisher` adapters (see each one's own file comment) —
  but the port and its contract still matter: it's the shape any future best-effort, fine-to-lose event
  would use directly, without needing the outbox's stronger (and heavier) durability guarantee. The
  RabbitMQ/Kafka split itself is unchanged by the outbox move — still picked per event by how it's meant to
  be consumed:
    - `account.created` (`CreateAccountUseCase`) → RabbitMQ. Task-queue-shaped: one event, one consumer (the
      simulated-email worker), no reason to replay it later.
    - `remittance.completed` (`SendRemittanceUseCase`) → Kafka. Event-stream-shaped: a business fact a
      consumer group can replay, and plausibly more than one consumer wants over time (today: the
      Elasticsearch indexer; analytics/audit are the obvious next ones) — Kafka's retention/replay model
      fits that, RabbitMQ's work-queue model doesn't.

  Both adapters (`infra/events/`) catch and log their own connect/publish failures rather than propagating
  them; `InMemoryEventPublisher` is the test/fake counterpart (records published events in an array). Both
  `SendRemittanceUseCase` and `CreateAccountUseCase` take an `OutboxRepository` as a required constructor
  arg now, same slot `EventPublisher` used to occupy — no default, so every construction site (factory,
  test) is explicit about it (see the Transactional Outbox bullet above). Four separate consumer/relay
  processes exist in `infra/events/consumers/`, none part of `buildApp()`:
    - `account-created-consumer.ts` (`npm run worker:account-created`) logs a simulated "confirmation email
      sent" line per event and acks.
    - `remittance-completed-indexer.ts` (`npm run worker:remittance-indexer`) indexes each event into
      Elasticsearch via `ElasticsearchRemittanceSearchIndex` (`infra/persistence/elasticsearch/`) — catches
      and logs its own indexing failures rather than crashing the consumer (same best-effort posture as
      `EventPublisher` itself), so a bad message is dropped, not retried forever.
    - `outbox-relay.ts` (`npm run worker:outbox-relay`) is the RabbitMQ producer side of the `account.created`
      pair above — see the Transactional Outbox bullet.
    - `kafka-outbox-relay.ts` (`npm run worker:outbox-relay-kafka`) is the Kafka producer side of the
      `remittance.completed` pair above, kept as its own process rather than folded into `outbox-relay.ts` —
      see the Transactional Outbox bullet.

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
  imported. Like Mongo/RabbitMQ/Kafka/Elasticsearch (see [infrastructure.md](infrastructure.md)), a
  failed/unreachable Loki or Tempo is non-fatal — only the Postgres and Redis checks inside `buildApp()`
  block boot.
- **Resilience** (`infra/resilience/`): timeout, retry with exponential backoff+jitter, and a circuit
  breaker for synchronous external-provider calls, built on `cockatiel` — confined entirely to
  `resilient-http-client.ts`, the only module in the codebase that imports it; everything else (starting
  with `HttpExchangeRateProvider` in `infra/exchange/`) depends only on plain functions and this project's
  own error types (`errors.ts`), never on cockatiel directly, so the application layer's port
  (`ExchangeRateProvider`) stays ignorant of which HTTP/retry/circuit-breaker library backs it. Retry
  classification (`retry-classifier.ts`) and the backoff+jitter formula (`backoff.ts`) are both pure,
  dependency-free functions, independently unit-tested. `HttpExchangeRateProvider` is opt-in
  (`FX_PROVIDER=http` in `remittance-factory.ts`; `MockExchangeRateProvider` stays the default) against a
  deterministic local `fake-fx-server.ts` (also what its own tests exercise) rather than a real paid FX API.
  The same retry/backoff shape backs `account-created-consumer.ts`'s RabbitMQ retry queue (via
  `rabbitmq-retry-topology.ts`'s dead-letter-exchange-based delay, not an in-process sleep) and its
  Redis-backed idempotent-consumer guard (reusing `IdempotencyRepository`/`redisRegistry`, the same port
  `IdempotentDecorator` uses — see the Idempotency bullet above). See [resilience.md](resilience.md) for the
  full design (why each concern is separate, what's retried and why, circuit states, the RabbitMQ topology,
  and the delivery/idempotency guarantees this project actually makes).
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

See [known-issues.md](known-issues.md) for gaps between this doc and the real tree, and for fixed-bug
history. See [infrastructure.md](infrastructure.md) for what each external service (Postgres, Redis,
RabbitMQ, Kafka, Elasticsearch, Mongo) backs and how to run them.
