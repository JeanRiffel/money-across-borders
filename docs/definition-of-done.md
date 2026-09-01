# Definition of Done

Referenced from [AGENTS.md](../AGENTS.md). Applies to both human and AI-driven changes. A task is not done
merely because the code compiles or the diff "looks right" — check every item that's actually relevant to
the change; most changes won't touch all of them.

- [ ] **Follows the existing architecture.** Dependencies still point inward (domain → application → infra);
      no new use case bypasses `UnitOfWork`/`IdempotentDecorator`/the port interfaces without a deliberate,
      stated reason. See [architecture.md](architecture.md).
- [ ] **Relevant tests were added or updated.** A behavior change without a test change is suspicious by
      default — say explicitly why if none was needed (e.g. a pure doc/comment change).
- [ ] **`npm test` passes.** The full Jest use-case suite, not just the file(s) you touched — see
      [AGENTS.md](../AGENTS.md) "Commands".
- [ ] **`npm run lint` and `npm run format:check` pass.** Run `npm run lint:fix && npm run format`
      (`/lint-format`) first if either fails on style/formatting alone.
- [ ] **Affected integration/concurrency suites pass, if the change touches infra they exercise.** Postgres
      persistence, transaction boundaries, or the HTTP layer → `npm run test:integration`. Wallet
      locking/isolation/idempotency mechanics → `npm run test:concurrency`. Both need a reachable, migrated
      Postgres (`/db-migrate`) — run them when you have one available; if you can't (no Postgres in this
      environment), say so explicitly rather than reporting them as passed.
- [ ] **Relevant invariants were considered.** If the change touches money, wallets, ledger entries,
      remittances, or idempotency, check it against [docs/invariants.md](invariants.md) — does it preserve
      every **Guaranteed** invariant listed there? If it narrows an **Intended** one into a **Guaranteed**
      one (or the reverse), update that document in the same change.
- [ ] **Documentation is updated when behavior or architecture changes.** New env var → `.env.example` +
      [infrastructure.md](infrastructure.md). New architectural decision of real significance → a new ADR
      (see [docs/adr/README.md](adr/README.md)). Changed invariant → [invariants.md](invariants.md). Don't
      let a doc go stale in the same change that makes it stale.
- [ ] **No unrelated changes.** Formatting/reordering of code you didn't otherwise touch, drive-by renames,
      or "while I was in there" fixes belong in a separate change — they make the diff harder to review and
      harder to revert independently.
- [ ] **Security implications were considered.** No secrets or credentials committed; no production config
      changed without being explicitly asked for; no destructive DB command run without explicit
      authorization; no weakening of authentication/authorization or of a financial consistency guarantee
      without calling it out plainly. See "Rules for modifying this repository" in
      [AGENTS.md](../AGENTS.md).

For non-trivial changes, do the review pass yourself before calling it done — read the diff back, check it
against the items above, and only then hand it off. See [docs/workflow.md](workflow.md) for the recommended
end-to-end flow this checklist sits at the end of, and `.claude/skills/review/SKILL.md` for a structured
review pass covering these same concerns.
