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

## How agent instructions are organized

Each file below has authority over a specific concern; none should duplicate what another already states —
if a rule seems to need writing in two places, it belongs once in whichever file is listed as authoritative
here, and the other links to it instead.

- **AGENTS.md** (this file) — canonical, tool-agnostic engineering rules: what this project is, commands,
  architecture map, invariants pointer, the standard workflow, and the hard rules in "Rules for modifying
  this repository" below. Read this first, regardless of which agent/tool is reading it.
- **`docs/*.md`** — the deep dives this file links out to instead of inlining: domain/architecture knowledge
  ([architecture.md](docs/architecture.md), [infrastructure.md](docs/infrastructure.md),
  [resilience.md](docs/resilience.md)), what's actually guaranteed ([invariants.md](docs/invariants.md)),
  documented gaps ([known-issues.md](docs/known-issues.md)), process ([workflow.md](docs/workflow.md),
  [definition-of-done.md](docs/definition-of-done.md), [safety.md](docs/safety.md)), and narrow how-tos
  ([seed.md](docs/seed.md), [concurrency-lab.md](docs/concurrency-lab.md)). `docs/adr/` records *why* past
  decisions were made, not current rules.
- **`.github/instructions/*.instructions.md`** — path-scoped restatements of AGENTS.md/`docs/` for one area
  (domain/application, persistence, tests), auto-applied by Copilot via each file's `applyTo` glob when a
  matching file is open/changed. Not a separate source of truth — if one of these ever says something
  AGENTS.md doesn't, treat that as a bug in the instructions file, not new policy.
- **`.github/copilot-instructions.md`** — Copilot's fixed entry point; points back to AGENTS.md and adds
  nothing new.
- **`CLAUDE.md`** and **`.claude/skills/`** — Claude-Code-specific mechanisms only (skills, hooks, slash
  commands). `CLAUDE.md` itself is just a pointer to this file plus a table of skills that wrap the commands
  documented below.

## Runtime: Node/npm is canonical

**Node + npm is the canonical toolchain** — `.github/workflows/ci.yml`, the `Dockerfile`, `package-lock.json`,
and the Husky pre-commit hook all use it, and every script except `npm start` runs on plain `ts-node`. `bun`
appears in exactly one place: `npm start` shells out to `nodemon --exec bun run ...` for local dev
convenience — everything else (`npm run dev`, `npm run dev:watch`, tests, lint, migrations, workers) uses
`ts-node`/Jest/ESLint directly and needs no Bun install. Use `npm install`/`npm run <script>` unless you
specifically want that one script's Bun-based dev loop; a committed `bun.lock` exists for that path but isn't
what CI or Docker builds from.

## Commands

There is no `node_modules` installed in this environment — run `npm install` first (or `bun install` if you
specifically want `npm start`'s Bun-based dev loop — see "Runtime" above).

```bash
npm install               # canonical; `bun install` also works, see "Runtime" above

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
                           # 003_create_outbox_events.sql + 004_add_wallet_version.sql

npm run worker:account-created     # consumes account.created from RabbitMQ, simulates a confirmation email
npm run worker:remittance-indexer  # consumes remittance.completed from Kafka, indexes it into Elasticsearch
npm run worker:outbox-relay        # polls Postgres outbox_events and publishes unpublished rows to RabbitMQ

npm run demo:fake-fx-server  # deterministic local FX HTTP server — see docs/resilience.md; pair with
                              # FX_PROVIDER=http to exercise HttpExchangeRateProvider's resilience layer

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

**CI and local hooks**: a GitHub Actions workflow (`.github/workflows/ci.yml`) has two jobs — `fast` (`lint`,
`format:check`, `test`; needs no infrastructure) on every push/PR to `main`, and `integration` (migrations,
`test:integration`, `test:concurrency`, a seed smoke run, all against real Postgres/Redis service
containers) on the same triggers. Neither is currently a required status check, so a red run doesn't block
merging a PR. A Husky pre-commit hook (`.husky/pre-commit`, wired up via the `prepare` script so it's
installed automatically by `npm install`) runs `npm test` locally before every commit.

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

Several files are mid-refactor or stubbed. See [docs/known-issues.md](docs/known-issues.md) before relying
on a path you haven't checked yourself, and for a history of previously-fixed bugs in case behavior looks
unfamiliar.

See `JWT_IMPLEMENTATION.md` for the JWT auth flow in detail (`JWTService.generate`/`verify`,
`authMiddleware`, `createJWTService()` factory) if working on authentication.

## Important invariants

This is a financial system — [docs/invariants.md](docs/invariants.md) is the source of truth for what's
actually **guaranteed** (double-entry balancing, wallet non-negative balance, idempotent claim/save/release,
`UnitOfWork` atomicity, ...) versus merely **intended** versus a **known violation** (e.g. concurrent debits
on the same wallet aren't isolation-safe today — no row lock is taken; a wallet opened with a nonzero
`initialBalanceMinorUnits` has no matching ledger entries). Read it before touching money, wallets, ledger
entries, remittances, or idempotency, and update it in the same change if you alter one of these guarantees.
[docs/adr/](docs/adr/) records *why* the major decisions behind these invariants were made (Postgres as
source of truth, the Transactional Outbox, Redis-backed idempotency, RabbitMQ vs Kafka, Elasticsearch as a
read model, treasury wallets, `UnitOfWork`).

## Development workflow and Definition of Done

Recommended flow for any non-trivial change: **Understand → Inspect → Plan → Implement → Test → Review →
Validate** — see [docs/workflow.md](docs/workflow.md) for what each step means concretely in this repo
(narrowest test first, wiring order, when to actually reach for `test:integration`/`test:concurrency`).
A change isn't done because it compiles — see [docs/definition-of-done.md](docs/definition-of-done.md) for
the checklist (tests, lint, format, affected invariants, docs kept in sync, no unrelated changes, security
considered) before calling any non-trivial task finished.

## Rules for modifying this repository

See [docs/safety.md](docs/safety.md) for these rules organized as three tiers (safe / requires the user to
have actually asked / requires explicit human approval every time) alongside this repo's actual tooling
(manual-only skills, non-blocking CI). This section remains the authoritative source; safety.md is a
scannable index of it, not a second copy of the policy.

- Don't weaken a **Guaranteed** invariant from [docs/invariants.md](docs/invariants.md) — double-entry
  balancing, non-negative balances, idempotent claim/save/release, `UnitOfWork` atomicity — without calling
  it out explicitly; never do it silently as a side effect of an unrelated change.
- Don't bypass `authMiddleware`, weaken JWT verification, or otherwise loosen authentication/authorization
  without being explicitly asked to — including *not* building new features on top of the known
  `accountId`-isn't-checked-against-the-token gap as if it were acceptable long-term behavior (see
  "Known inconsistencies" above).
- Never commit secrets or credentials; `.env` is real local config, `.env.example` is the template — don't
  put a real value in the latter.
- Don't run destructive database commands (`--reset`, `TRUNCATE`, dropping tables) or apply migrations
  against anything but your own local/dev Postgres without explicit authorization — `/db-migrate` and
  `/seed-data` are manual-only for exactly this reason (see "Skills" in `CLAUDE.md`).
- Don't silently rewrite an already-applied migration; add a new numbered one instead, additive by default
  (see the migration files under `src/infra/persistence/postgresql/migrations/` for the existing style).
- Don't change production configuration (`.env`, `docker-compose.yml`, CI secrets) without being explicitly
  asked to.
- Keep changes scoped to what was asked — this repo documents its own known gaps deliberately (see "Known
  inconsistencies"); don't "fix" one in passing as part of an unrelated task without flagging it first.

For AI-agent-specific tooling: Claude Code skills live under `.claude/skills/` (see `CLAUDE.md`); GitHub
Copilot's repository-level instructions are in `.github/copilot-instructions.md` and path-specific ones in
`.github/instructions/` — both point back to this file as the canonical source rather than duplicating it.
