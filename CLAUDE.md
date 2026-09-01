# CLAUDE.md

This project's guidance for AI coding agents lives in a single, tool-agnostic file so it isn't duplicated
across Claude Code, Codex, Cursor, Aider, and friends. See:

@AGENTS.md

Add Claude-Code-specific instructions (hooks, skills, slash commands) below this line if/when they're
needed — anything agent-agnostic belongs in AGENTS.md instead.

## Skills

Project-scoped skills live in `.claude/skills/<name>/SKILL.md` and wrap the commands documented in
[AGENTS.md](AGENTS.md) so they're one `/name` away instead of retyped each time. They stay out of context
until invoked, so adding more doesn't cost tokens on every turn.

| Skill | Invokes | Notes |
|---|---|---|
| `/run-tests [pattern]` | `npm test [-- pattern]` | In-memory Jest suite, no external services. Claude may also invoke this one automatically. |
| `/db-migrate` | `npm run db:migrate` | Needs a reachable Postgres. Manual-only (`disable-model-invocation`). |
| `/seed-data [flags]` | `npm run seed -- [flags]` | See [docs/seed.md](docs/seed.md). Needs a migrated Postgres. Manual-only. |
| `/concurrency-lab` | `npm run test:concurrency` | See [docs/concurrency-lab.md](docs/concurrency-lab.md). Needs a migrated Postgres. Manual-only. |
| `/lint-format` | `npm run lint:fix && npm run format` | Not covered by the Husky pre-commit hook (which only runs `npm test`). |
| `/docker-stack` | `docker compose up --build` | Full stack — app + Postgres + Redis + RabbitMQ + Kafka + Elasticsearch + workers. Manual-only, heavyweight. |
| `/review` | (no command — reads the diff directly) | Read-only structured review against this project's architecture/invariants/concurrency/security concerns — see [docs/invariants.md](docs/invariants.md). Never edits files. Manual-only. |

Skills marked manual-only (`disable-model-invocation: true`) either touch a real database, the filesystem
broadly, or spin up containers, or (like `/review`) represent a deliberate, heavier pass the user should
trigger explicitly rather than one Claude reaches for on its own — they only run when a user explicitly asks
(via `/name`), never inferred by Claude from conversation context. See [docs/safety.md](docs/safety.md) for
this same boundary generalized across all tooling, not just Claude skills. Add new skills the same way: point
`allowed-tools` narrowly at what the skill actually needs, and link back to the relevant `docs/*.md` instead
of duplicating it.
