# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, Cursor, Aider, and others that read
`AGENTS.md`) when working with code in this repository. It's kept short on purpose — deep dives live under
[docs/](docs/) and are linked from the relevant section below.

## What this is

**Money Across Borders** (package name `money-across-borders`; the repo/folder is still named
`clean-ledger`) is a **cross-border remittance platform** — multi-currency wallets, FX conversion, and
international money transfer between platform accounts, built as an architecture showcase: Clean
Architecture, DDD, SOLID, ACID transactions, idempotency, and horizontal scalability, in Express +
TypeScript. The payments domain is the vehicle for demonstrating the architecture, not the point of the
project.

Domain shape: accounts hold one or more currency-denominated **wallets**; every balance change is recorded
as an immutable, double-entry **ledger entry**; a **remittance** converts money from one wallet's currency
to another's via a mocked FX rate and posts through system-owned per-currency **treasury** wallets so every
currency's ledger stays balanced independently (see "Cross-currency ledger balancing" in
[docs/architecture.md](docs/architecture.md)); a basic **compliance/KYC** check gates how much an unverified
sender can move.

End-to-end and reachable over HTTP today: create an account (`POST /account`), log in (`POST /login`),
open a wallet (`POST /wallets`), submit KYC (`POST /kyc`), send a remittance (`POST /remittances`), and
search remittances (`GET /remittances`). Interactive docs for all of the above are served at `GET /docs`
(Swagger UI, generated from `@openapi` JSDoc blocks in `src/interfaces/http/routes/*/routes.ts` — see
`src/interfaces/http/docs/swagger.ts`); it's unauthenticated, like `/health` and `/metrics`. This flow is
**Postgres-backed**
(`src/infra/persistence/postgresql/postgres-registry.ts`, wired into every `*-factory.ts`) — the app
requires a reachable, migrated Postgres to boot at all (`server.ts` fails fast, `process.exit(1)`, if the
connection check fails). `npm test`'s use-case tests still run entirely against the **in-memory** repos
(`src/infra/persistence/in-memory/`), constructed directly, bypassing the factory/Postgres layer completely.
All other external integrations (FX rates, compliance/KYC) stay **mocked** — no real payment-rail/
KYC-provider calls happen. `POST /login` (`LoginUseCase`, behind `userRouter`) authenticates by
email/password against `User` and returns a real JWT — `/wallets` and `/remittances`, which sit behind
`authMiddleware`, take that token as a normal `Authorization: Bearer` header now; `/account` and `/login`
are themselves unauthenticated (you can't have a token before you sign up or log in). `authMiddleware` only
checks that the token is a validly-signed, unexpired JWT — it does not check that the token's `accountId`
matches the `accountId` in the request body, so any logged-in user's token currently authorizes any
account's wallet/remittance calls; there's no per-resource authorization layer yet. Several other files are
mid-refactor or stubbed (see [docs/known-issues.md](docs/known-issues.md)). Don't assume the whole tree
compiles or that every wired-up path is functional; check the specific files you're touching.

Idempotency (`account`/`wallet`/`remittance`/`kyc`) is Redis-backed, not part of the Postgres-backed flow —
a real, load-bearing dependency. `server.ts` fails fast on an unreachable Redis the same way it does for
Postgres. Beyond Postgres/Redis, four more pieces of infra (RabbitMQ, Kafka, Elasticsearch, Mongo) are wired
to specific, narrow jobs, all non-fatal at boot — see [docs/infrastructure.md](docs/infrastructure.md) for
exactly what each one backs.

`npm run seed` (`src/infra/seed/`) generates a deterministic, financially-coherent dataset (customers,
wallets, ledger-backed balances, remittances in every status the schema supports) directly against Postgres
for functional/concurrency/load testing — see [docs/seed.md](docs/seed.md) for usage, distributions, and
its documented deviations from the live HTTP flow (e.g. it can seed KYC/remittance statuses the real use
cases never persist today).

## Commands

There is no `node_modules` installed in this environment — run `bun install` or `npm install` first.

```bash
bun install              # or npm install

npm test                 # run all tests (jest)
npm test -- <pattern>    # run a subset, e.g. npm test -- create-account
npm run test:watch
npm run test:coverage

npm run test:integration  # Cucumber, needs a reachable, migrated Postgres
npm run test:concurrency  # Postgres concurrency lab (locking/isolation/idempotency), needs the same

npm run seed -- --customers 100 --seed 42   # deterministic financial fixture data — see docs/seed.md
npm run test:seed          # seed's own integration suite, needs a reachable, migrated Postgres

npm run lint             # eslint src --ext .ts
npm run lint:fix
npm run format           # prettier --write src/**/*.ts
npm run format:check

npm start                # nodemon --exec bun run src/main/server.ts
npm run dev               # ts-node src/main/server.ts
npm run dev:watch

npm run db:migrate        # applies migrations/001_init_schema.sql + 002_seed_treasury_wallets.sql +
                           # 003_create_outbox_events.sql

npm run worker:account-created     # consumes account.created from RabbitMQ, simulates a confirmation email
npm run worker:remittance-indexer  # consumes remittance.completed from Kafka, indexes it into Elasticsearch
npm run worker:outbox-relay        # polls Postgres outbox_events and publishes unpublished rows to RabbitMQ

docker compose up --build # app + Postgres + Redis + RabbitMQ + Kafka + Elasticsearch + all three workers
                           # above, in containers — no local install needed
```

A single test file: `npm test -- __tests__/domain/entities/account.test.ts`.

`npm test` needs no external services — it never touches Postgres, Redis, RabbitMQ, Kafka, Elasticsearch, or
Mongo. Everything else (running the server, the workers, `docker compose`, required `.env` vars, and known
`dotenv`/env-var quirks) is covered in [docs/infrastructure.md](docs/infrastructure.md). Postgres locking/
isolation-level/idempotency mechanics specifically (raw SQL against real `wallets`/`idempotency_records`
rows, kept out of the production write path) are covered in
[docs/concurrency-lab.md](docs/concurrency-lab.md).

**CI and local hooks**: a GitHub Actions workflow (`.github/workflows/ci.yml`) runs `lint`, `format:check`,
and `test` on every push and pull request targeting `main`; it is not currently a required status check, so
a red run doesn't block merging a PR. A Husky pre-commit hook (`.husky/pre-commit`, wired up via the
`prepare` script so it's installed automatically by `bun install`/`npm install`) runs `npm test` locally
before every commit.

## Architecture

Clean Architecture with dependency rule "dependencies point inward." Each layer lives under `src/`,
organized **by layer first, then by bounded context** (`user`, `account`, `wallet`, `ledger`, `exchange`,
`compliance`, `remittance`). `User` is the identity/authentication aggregate; `Account` is the financial/
ledger relationship that `Wallet`, `Remittance`, and `KycProfile` reference by id and deliberately carries
no credentials.

See [docs/architecture.md](docs/architecture.md) for the full `src/` folder map and the key patterns to
follow when extending this code: use cases, the idempotency decorator, entities/value-objects conventions,
DTOs, wiring order, `UnitOfWork`, the Transactional Outbox, `EventPublisher` (RabbitMQ vs Kafka), the CQRS
read side for `GET /remittances`, observability, cross-currency ledger balancing, the Mongo strategy
pattern, and test layout.

## Known inconsistencies

Several files are mid-refactor, stubbed, or documented inaccurately elsewhere in the repo (e.g. `README.md`
still describes the pre-pivot layout). See [docs/known-issues.md](docs/known-issues.md) before relying on a
path you haven't checked yourself, and for a history of previously-fixed bugs in case behavior looks
unfamiliar.

See `JWT_IMPLEMENTATION.md` for the JWT auth flow in detail (`JWTService.generate`/`verify`,
`authMiddleware`, `createJWTService()` factory) if working on authentication.
