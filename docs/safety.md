# Safety boundaries

Referenced from [AGENTS.md](../AGENTS.md). This page doesn't introduce new rules — it's a single,
scannable index of safety-relevant policy that already exists, scattered across AGENTS.md's "Rules for
modifying this repository", `.claude/skills/*/SKILL.md`'s `disable-model-invocation` flags, and
[definition-of-done.md](definition-of-done.md). If this page and AGENTS.md ever disagree, AGENTS.md is
authoritative — fix this page, not the behavior.

Three tiers, judged by what's actually true of this repo's tooling today (a Husky pre-commit hook that only
runs `npm test`, a CI workflow whose jobs are not required status checks, five skills already marked
manual-only) — not a hypothetical policy for a different project.

## Tier 1 — Safe, no confirmation needed

Read-only or trivially reversible; skills below have no `disable-model-invocation` flag, i.e. an agent may
reach for them on its own:

- Reading files, `git log`/`git show`/`git diff`, searching/grepping code.
- `npm test` / `/run-tests` — the Jest use-case suite, entirely in-memory, touches no external service.
- `npm run lint`, `npm run format:check` — read-only checks.
- `npm run lint:fix`, `npm run format` / `/lint-format` — auto-fixes only; always reviewable via `git diff`
  before anything is committed.
- `/review` — explicitly read-only by its own skill definition; reports findings, never edits.

## Tier 2 — Requires the user to have actually asked for it

Not safe to reach for from conversational inference alone — each of these is a real, named skill invocation
or command the user must trigger, because it writes to a real database/container, not because the action is
inherently dangerous:

- `npm run db:migrate` / `/db-migrate` — applies schema changes to whatever Postgres the `POSTGRES_*` env
  vars point at. Additive by default (see Tier 3 for the destructive case).
- `npm run seed` / `/seed-data` — writes a generated dataset directly into Postgres; `--reset` wipes business
  tables first (see Tier 3).
- `npm run test:integration`, `npm run test:concurrency`, `npm run test:seed` — write to a real, non-mocked
  Postgres (and, for `test:integration`, Redis); the Cucumber suite's writes are not rolled back.
- `docker compose up --build` / `/docker-stack` — heavyweight: builds images, starts 8+ containers.
- Deleting files, or a change wide enough to touch many files at once (a refactor, a rename sweep).
- Editing `.github/workflows/ci.yml` or any other CI configuration.

All five manual-only skills (`/db-migrate`, `/seed-data`, `/concurrency-lab`, `/docker-stack`, `/review`)
encode this tier's "only on explicit request" rule directly via `disable-model-invocation: true` — see the
"Skills" table in [CLAUDE.md](../CLAUDE.md).

## Tier 3 — Explicit human approval required, every time

A prior approval doesn't carry forward to the next instance of the same category — ask again:

- Any destructive database operation (`TRUNCATE`, `DROP`, `--reset` against anything but the user's own
  local/dev Postgres).
- Editing an already-applied migration in place instead of adding a new numbered one.
- Changing production configuration: `.env`, `docker-compose.yml`, CI secrets.
- Committing a secret/credential, or putting a real value into `.env.example` (the template, not the real
  config).
- Weakening or bypassing `authMiddleware`/JWT verification, or building a new feature on top of the known
  `accountId`-vs-JWT gap (see [known-issues.md](known-issues.md)) as if it were acceptable long-term
  behavior.
- Weakening a **Guaranteed** invariant from [invariants.md](invariants.md) without calling it out explicitly
  in the same change.
- Disabling, skipping, or otherwise weakening a test to make a suite pass.
- Committing or pushing code, or opening a PR — a human decides when work is ready to land, not the agent.

## What this doesn't cover

CI is not a required status check on this repo today (a red `fast`/`integration` run doesn't block merging a
PR) — that makes it more important, not less, to actually run the tests a change touches and report the real
result, rather than treating "CI will catch it" as a substitute. See
[definition-of-done.md](definition-of-done.md) for what "tested" means concretely, and
[workflow.md](workflow.md) for where in the engineering loop these boundaries apply.
