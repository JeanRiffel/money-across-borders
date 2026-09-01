# AI development workflow

Referenced from [AGENTS.md](../AGENTS.md). The recommended flow for any non-trivial change in this
repository, for coding agents and humans alike:

**Understand → Inspect → Plan → Implement → Test → Review → Validate**

1. **Understand** the request. What's actually being asked, and what would count as done? For anything
   touching money, wallets, ledger entries, remittances, or idempotency, that includes knowing which
   invariants in [docs/invariants.md](invariants.md) are in play before writing code.
2. **Inspect** the relevant code before changing it — don't assume [AGENTS.md](../AGENTS.md) or `docs/*.md`
   are fully up to date; this repo deliberately documents its own known inconsistencies (see
   [known-issues.md](known-issues.md)). Read the actual files you're about to touch, and their tests.
3. **Identify constraints**: which architectural layer does this belong in (see
   [architecture.md](architecture.md))? Does it cross the Postgres/Redis/RabbitMQ/Kafka/Elasticsearch/Mongo
   boundary, and if so, is that dependency fatal-at-boot or best-effort (see
   [infrastructure.md](infrastructure.md))? Does it touch a **Guaranteed** invariant in
   [invariants.md](invariants.md)?
4. **Plan** a concise approach for anything beyond a one-line fix — which files change, in what order
   (domain port → application use case → infra adapter → factory → wiring, per
   [architecture.md](architecture.md)'s "Wiring order" bullet), and what could break. Skip this step for
   genuinely trivial changes; don't skip it to save time on something that touches the write path.
5. **Implement the smallest change that actually satisfies the request.** Prefer extending an existing
   pattern (a new `Postgres*Repository` method, a new use case following the existing DTO/entity/value-object
   conventions) over introducing a new one. Don't refactor unrelated code, rename things "while you're in
   there", or add abstraction the current codebase doesn't already use, unless the task specifically asks
   for it.
6. **Test narrow first, then broad.** Run the single test file or pattern closest to your change
   (`npm test -- <pattern>`, `/run-tests <pattern>`) before the full suite. Only run
   `npm run test:integration` / `npm run test:concurrency` / `npm run test:seed` when the change actually
   touches what they cover (Postgres persistence, transaction/locking behavior, or the seed pipeline) — they
   need real infrastructure (see [infrastructure.md](infrastructure.md)), so don't run them reflexively, and
   say plainly if they can't be run in the current environment rather than skipping them silently.
7. **Review your own diff** before calling it done — `git diff` (or the equivalent) end to end, not just the
   files you remember touching. Check it against
   [docs/definition-of-done.md](definition-of-done.md). `.claude/skills/review/SKILL.md` structures this pass
   around this project's specific risk areas (financial invariants, concurrency, idempotency, transaction
   boundaries, security, unintended changes).
8. **Validate** that nothing unrelated moved: no accidental formatting-only diffs in untouched files, no
   dependency bumps you didn't mean to make, no env var or migration silently changed. Run
   `npm run lint`/`npm run format:check` (`/lint-format` to fix) if you haven't already.

This flow scales down naturally — a one-line typo fix doesn't need a written plan or the full test matrix,
just don't skip step 7 (review the diff) even for small changes; it's the cheapest step and catches the most
avoidable mistakes.

## Task categories (quick-reference)

Not a required classification step — skip it when a task's shape is already obvious. Useful when it isn't,
to jump straight to the docs/skills that actually apply instead of re-deriving them:

| Category | Start with | Test/skill |
|---|---|---|
| Domain/application logic | [architecture.md](architecture.md), `.github/instructions/domain.instructions.md` | `/run-tests` |
| Database/persistence | `.github/instructions/persistence.instructions.md`, [invariants.md](invariants.md) | `/db-migrate`, `test:integration` |
| Concurrency/locking | [concurrency-lab.md](concurrency-lab.md), invariants.md "Wallet"/"Transactional consistency" | `/concurrency-lab` |
| Messaging/events | architecture.md's `EventPublisher`/Outbox bullets, [infrastructure.md](infrastructure.md) | `worker:*` scripts |
| Infrastructure/Docker | infrastructure.md | `/docker-stack` |
| Tests | `.github/instructions/tests.instructions.md` | `/run-tests` |
| Documentation | [known-issues.md](known-issues.md) — check before "fixing" a documented gap in passing | — |
| Security/auth | AGENTS.md "Rules for modifying this repository", [safety.md](safety.md) | `/review` |

This is a lookup aid, not new guidance — every cell links to something that already exists elsewhere in this
document set.
