# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Money Across Borders** (package name `money-across-borders`; the repo/folder is still named
`clean-ledger`) is a **cross-border remittance platform** — multi-currency wallets, FX conversion, and
international money transfer between platform accounts, in the spirit of **Wise, Nomad, and Remessa
Online** — built as an architecture showcase: Clean Architecture, DDD, SOLID, ACID transactions,
idempotency, and horizontal scalability, in Express + TypeScript. The payments domain is the vehicle for
demonstrating the architecture, not the point of the project.

Domain shape: accounts hold one or more currency-denominated **wallets**; every balance change is recorded
as an immutable, double-entry **ledger entry**; a **remittance** converts money from one wallet's currency
to another's via a mocked FX rate and posts through system-owned per-currency **treasury** wallets so every
currency's ledger stays balanced independently (see "Cross-currency ledger balancing" below); a basic
**compliance/KYC** check gates how much an unverified sender can move.

End-to-end and reachable over HTTP today: create an account (`POST /account`), open a wallet
(`POST /wallets`), and send a remittance (`POST /remittances`). All persistence for this flow is
**in-memory** (`src/infra/persistence/in-memory/in-memory-registry.ts`) and all external integrations (FX
rates, compliance/KYC) are **mocked** — no real Postgres/Mongo/payment-rail/KYC-provider calls happen.
There is no HTTP login/token-issuance endpoint yet (see "Known inconsistencies"), so `/wallets` and
`/remittances`, which sit behind `authMiddleware`, need a JWT minted directly via `JWTService`/
`jsonwebtoken` for manual testing — `/account` itself is intentionally unauthenticated (it's the signup
endpoint). Several other files are mid-refactor or stubbed (see "Known inconsistencies" below). Don't
assume the whole tree compiles or that every wired-up path is functional; check the specific files you're
touching.

## Commands

There is no `node_modules` installed in this environment — run `bun install` or `npm install` first.

```bash
bun install              # or npm install

npm test                 # run all tests (jest)
npm test -- <pattern>    # run a subset, e.g. npm test -- create-account
npm run test:watch
npm run test:coverage

npm run lint             # eslint src --ext .ts
npm run lint:fix
npm run format           # prettier --write src/**/*.ts
npm run format:check

npm start                # nodemon --exec bun run src/main/server.ts
npm run dev               # ts-node --esm src/main/server.ts
npm run dev:watch
```

A single test file: `npm test -- __tests__/domain/entities/account.test.ts`.

Copy `.env.example` to `.env` before running the server; it needs `JWT_SECRET`, `DATABASE_URL`,
`MONGO_URI`, `RABBITMQ_URL` (Postgres connection in code currently reads `POSTGRE_*` vars instead —
see inconsistencies below).

## Architecture

Clean Architecture with dependency rule "dependencies point inward." Each layer lives under `src/`,
organized **by layer first, then by bounded context** (`account`, `wallet`, `ledger`, `exchange`,
`compliance`, `remittance`):

```
src/
 ├── domain/<context>/         entities, value-objects, repository interfaces (ports) — no framework deps
 │    ├── ledger/services/     LedgerService — first domain service in the codebase (needs a port, LedgerRepository)
 │    └── shared/              cross-context domain: Clock, errors.ts, Money/Currency value objects
 ├── application/<context>/    use cases + DTOs, orchestrate domain objects
 │    ├── repositories/        ports the application layer depends on (e.g. IdempotencyRepository)
 │    └── shared/              cross-cutting ports: authentication, idempotency, security, exchange, compliance, pricing
 ├── infra/                    concrete adapters implementing domain/application ports
 │    ├── authentication/      JWTService (implements TokenGenerator + TokenVerifier)
 │    ├── config/database/     Postgres pool, Mongo singleton, Redis client (Strategy pattern via DatabaseStrategy/DatabaseContext)
 │    ├── config/message-broker/ RabbitMQ connection/producer/consumer
 │    ├── compliance/          InMemoryComplianceChecker — fixed threshold rule, mocked
 │    ├── exchange/            MockExchangeRateProvider — static rate table, mocked
 │    ├── pricing/             FlatPercentageFeeCalculator — mocked
 │    ├── factories/           wire concrete adapters into a use case (e.g. account-factory.ts, remittance-factory.ts)
 │    ├── persistence/         postgresql/ (stubs, non-functional), in-memory/ (the actually-used repos + the
 │    │                        shared in-memory-registry.ts singleton — see below)
 │    ├── security/            BcryptPasswordHasher
 │    └── time/                SystemClock
 ├── interfaces/http/          Express-facing layer: controllers, routes, middlewares
 └── main/                     composition root: server.ts bootstraps Express + DI; <context>-module.ts
                                (e.g. account-module.ts, wallet-module.ts, remittance-module.ts) builds a
                                use case from injected dependencies
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
- **In-memory repositories share one process-wide instance** via `infra/persistence/in-memory/
  in-memory-registry.ts`, imported by every `*-factory.ts`. This is a deliberate deviation from
  each factory `new`-ing its own repository (fine for Postgres — one external, shared database — but
  fatal for in-memory mode, where separately-`new`'d repos per factory would make state invisible across
  contexts, e.g. an account created via `account-factory.ts` unreachable from `wallet-factory.ts`).
- **Cross-currency ledger balancing**: a single transaction can't balance directly across two currencies.
  System-owned **treasury wallets** (one per supported currency, owned by the reserved
  `TREASURY_ACCOUNT_ID` in `domain/wallet/treasury-account.ts`, seeded via `seed-treasury-wallets.ts`) act
  as the FX/fee counterparty, so every currency's legs net to zero independently. `LedgerService
  .postBalancedEntries()` (`domain/ledger/services/ledger-service.ts`) enforces this per-currency-zero-sum
  invariant before persisting. See `SendRemittanceUseCase` for the exact leg layout (principal + fee legs
  in the source currency, settlement legs in the destination currency; a same-currency shortcut skips
  treasury for the principal and routes only the fee through it).
- Database access uses a **Strategy pattern**: `DatabaseStrategy<T>` interface (`connect`/`disconnect`)
  with `DatabaseContext` as the strategy holder; see `mongo-database-sigleton.ts` for the Mongo singleton
  usage (filename typo is existing, not yet renamed). Mongo connection failure at startup is logged, not
  fatal — nothing in the account/wallet/remittance flow touches it.
- Tests mirror `src/`'s path structure under `__tests__/` (e.g. `src/domain/account/entities/account.ts` →
  `__tests__/domain/entities/account.test.ts`) and prefer `InMemory*` repository fakes over mocking
  frameworks for use-case tests.

## Known inconsistencies (check before relying on these paths)

- `README.md` still largely describes the pre-pivot account/ledger framing (and a `src/infrastructure/` /
  `src/domain/entities|value-objects|repositories` layout that never matched the real tree, which uses
  `src/infra/` and per-context subfolders like `src/domain/account/entities/...`). Its title/intro was
  updated for the cross-border pivot; the rest was not. Trust this file and the actual tree over the
  README's body.
- **No HTTP login/token-issuance endpoint exists.** `JWTService`/`createJWTService()` and `authMiddleware`
  work, but nothing issues a token over HTTP — `/wallets` and `/remittances` need a JWT minted directly
  (`jwt.sign(payload, process.env.JWT_SECRET)`) for manual testing until a login endpoint is built.
  `/account` (signup) is deliberately unauthenticated for this reason — gating account creation on auth
  would make it unreachable for a brand-new user.
- `src/infra/persistence/postgresql/postgres-account-repository.ts` and the Mongo-backed idempotency
  repository are still stubs (`throw new Error("Method not implemented.")`) — Postgres/Mongo persistence
  isn't functional. `account-factory.ts`, `wallet-factory.ts`, and `remittance-factory.ts` all wire to the
  shared in-memory registry instead (see Architecture above); use the `InMemory*` implementations for tests.
- `src/infra/config/database/postgresql/pg.ts` reads `POSTGRE_USER`/`POSTGRE_HOST`/`POSTGRE_DATABASE`/
  `POSTGRE_PORT`/`POSTGRE_PASSWORD` env vars, but `.env.example` only defines `DATABASE_URL`. Moot for now
  since nothing wires to Postgres, but relevant again once that adapter is implemented.
- The Docker Compose setup described in the README (multi-node NGINX load balancing, Postgres/Redis/
  Mongo/RabbitMQ stack) is not present in the repo yet — no `docker-compose.yml`.
- The compliance/KYC gate (`InMemoryComplianceChecker`) has no HTTP submit/verify endpoint — a
  `KycProfile` can only be marked `VERIFIED` by saving one directly through `KycProfileRepository` (tests
  or an ad-hoc script), not through the API. Below the fixed unverified-sender threshold, remittances work
  without one.
- FX rates (`MockExchangeRateProvider`) are a static table, not a live feed; the compliance threshold is
  applied in raw source-currency minor units, not FX-normalized; treasury wallets are seeded once with a
  large fixed balance rather than continuously rebalanced; and there's no unit-of-work/rollback across the
  several `save()` calls in `SendRemittanceUseCase` — all documented, deliberate simplifications for this
  showcase, not oversights.

Previously-documented bugs that are now fixed (kept here as history in case behavior looks unfamiliar):
the account controller's wrong import path and no-argument `execute()` call, the account router being
built but never mounted, and `IdempotentDecorator` reading `existing.response` when
`InMemoryIdempotencyRepository.findByKey` actually resolves to the response value directly (silently
returned `undefined` on every idempotency cache hit until fixed).

See `JWT_IMPLEMENTATION.md` for the JWT auth flow in detail (`JWTService.generate`/`verify`,
`authMiddleware`, `createJWTService()` factory) if working on authentication.
