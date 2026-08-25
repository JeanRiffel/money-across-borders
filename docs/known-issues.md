# Known Issues

## Known inconsistencies (check before relying on these paths)

- `README.md` still largely describes the pre-pivot account/ledger framing (and a `src/infrastructure/` /
  `src/domain/entities|value-objects|repositories` layout that never matched the real tree, which uses
  `src/infra/` and per-context subfolders like `src/domain/account/entities/...`). Its title/intro was
  updated for the cross-border pivot; the rest was not. Trust [architecture.md](architecture.md) and the
  actual tree over the README's body.
- Postgres persistence is functional (`account-factory.ts`, `wallet-factory.ts`, `remittance-factory.ts`,
  `user-factory.ts`, `compliance-factory.ts` all wire to `postgres-registry.ts` for everything except
  idempotency — see [architecture.md](architecture.md)); Mongo persistence is now functional too, but
  narrowly — only `MongoKycDossierRepository` touches it (see the `EventPublisher`/Mongo bullets in
  architecture.md); nothing else does. `npm test` uses the `InMemory*` implementations directly, never
  Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, or Mongo.
- A `docker-compose.yml` now covers Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, the app, and both
  `worker-*` services (see [infrastructure.md](infrastructure.md)), but it's still not the multi-node NGINX
  load balancing + Mongo stack the README's "Running Locally" section describes — that fuller setup
  (NGINX, multiple API instances, Mongo as a compose service) is still not present in the repo (Mongo runs
  outside Docker for this project, whatever `MONGO_HOST`/etc. in `.env` point at). Outside Docker, every
  one of Postgres/Redis/RabbitMQ/Kafka/Elasticsearch/Mongo is whatever its own `*_HOST`/etc. vars in `.env`
  point at, started/managed outside this repo.
- The compliance/KYC gate (`InMemoryComplianceChecker` — the name is legacy, it's a mocked business-rule
  checker, not an in-memory *store*; it takes whatever `KycProfileRepository` it's constructed with, and is
  wired to the Postgres one via `remittance-factory.ts`) now has an HTTP submit endpoint (`POST /kyc`) —
  this used to be a documented gap ("no HTTP submit/verify endpoint... a KycProfile can only be marked
  VERIFIED by saving one directly through KycProfileRepository") and no longer is. `SubmitKycUseCase`
  auto-verifies every submission synchronously rather than calling a real KYC provider — same
  mocked-and-immediate spirit as `MockExchangeRateProvider`/`InMemoryComplianceChecker` itself; there's
  still no separate async "verify" step or a way to reject a submission. Below the fixed unverified-sender
  threshold, remittances still work without submitting KYC at all.
- FX rates (`MockExchangeRateProvider`) are a static table, not a live feed; the compliance threshold is
  applied in raw source-currency minor units, not FX-normalized; and treasury wallets are seeded once with
  a large fixed balance (`migrations/002_seed_treasury_wallets.sql`) rather than continuously rebalanced —
  documented, deliberate simplifications for this showcase, not oversights. (`SendRemittanceUseCase`'s
  writes *are* now wrapped in a real transaction — see the `UnitOfWork` bullet in
  [architecture.md](architecture.md); that used to be on this list as a known gap and no longer is.)

## Previously-documented bugs (now fixed)

Kept here as history in case behavior looks unfamiliar: the account controller's wrong import path and
no-argument `execute()` call, the account router being built but never mounted, `IdempotentDecorator`
reading `existing.response` when `InMemoryIdempotencyRepository.findByKey` actually resolves to the
response value directly (silently returned `undefined` on every idempotency cache hit until fixed), and
`pg.ts` reading `POSTGRE_*` (missing the S) while `.env`/`.env.example` defined `POSTGRES_*` — `pg.ts` now
reads `POSTGRES_*`, matching `.env.example`. (At the time this was fixed, nothing wired to `pool` yet either
way — now everything does.) Also: `Account` used to double as the identity/auth aggregate (it carried a
`password` field directly), which meant the system treasury account had to be given a throwaway fake
password just to satisfy the entity — `User` is now its own domain (see the `user` vs `account` note in
[architecture.md](architecture.md)), `Account.userId` is nullable, and the treasury account is seeded with
`userId: null` / `user_id: NULL` instead. And: there used to be no HTTP login/token-issuance endpoint at
all, so `/wallets`/`/remittances` needed a JWT minted directly via
`jwt.sign(payload, process.env.JWT_SECRET)` for manual testing — `POST /login` (`LoginUseCase`, see
`application/user/uses-cases/login-use-case.ts`) now does this for real, checking email/password via
`PasswordHasher.compare` and returning a normal server-issued token. Also: every `Postgres*Repository`
used to be a stub and every `*-factory.ts` wired to the in-memory registry regardless — the app now
requires and uses real Postgres; only `npm test` still runs against the in-memory repos. Also:
`redisClient.ts` and `rabbitmq-connection.ts` both used to read `process.env.*` without ever calling
`dotenv.config()` themselves, relying on their entrypoint having loaded `.env` first — `server.ts` happened
to (via an earlier import in the same chain, for Redis), but the standalone `worker:account-created` script
didn't, so `RABBITMQ_HOST`/etc. silently read as `undefined` until `rabbitmq-connection.ts` got its own
`dotenv.config()` call, matching `pg.ts`'s existing pattern; `redisClient.ts` got the same fix preemptively,
since it only worked by the same kind of import-order luck. And: `mongo-database.ts` used to pass
`process.env.MONGO_HOST` straight to `new MongoClient(...)` as if it were a full connection string, and read
`process.env.MONGO_DB` for the database name — neither var existed anywhere — fixed to build the connection
string from `MONGO_HOST`/`MONGO_PORT`/`MONGO_USER`/`MONGO_PASSWORD` and read `MONGO_DATABASE`, matching
every other service's HOST/PORT/USER/PASSWORD convention. Both were non-fatal, so both were silently broken
rather than loudly, for a while.
