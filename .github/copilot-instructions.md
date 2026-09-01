# Copilot instructions

[AGENTS.md](../AGENTS.md) at the repo root is the canonical, tool-agnostic source of project instructions —
project purpose, architecture, commands, testing strategy, invariants, known limitations, and the rules for
modifying this repository. Read it before making changes here. This file exists only because Copilot looks
for it at this path; it deliberately doesn't duplicate AGENTS.md's content.

Path-specific detail lives in [.github/instructions/](instructions/) (domain/application, persistence, and
tests) and is applied automatically based on which files are open/changed.

A few things worth restating because they're easy to miss:

- This is a **financial system** (multi-currency wallets, double-entry ledger, cross-border remittances).
  Business/architectural invariants are documented in [docs/invariants.md](../docs/invariants.md) — read it
  before touching money, wallets, ledger entries, remittances, or idempotency, and never weaken a
  **Guaranteed** invariant listed there without calling it out explicitly.
- Respect Clean Architecture's dependency rule (domain → application → infra, never the reverse) — see
  [docs/architecture.md](../docs/architecture.md).
- Run the tests that match what you changed — see AGENTS.md's "Commands" and
  [docs/definition-of-done.md](../docs/definition-of-done.md). `npm test` needs no infrastructure;
  `test:integration`/`test:concurrency`/`test:seed` need a real, migrated Postgres (and Redis, for
  `test:integration`) — don't claim one of those passed without actually running it against reachable
  infrastructure.
- Never commit secrets, weaken authentication/authorization, or run a destructive database command without
  explicit authorization — see "Rules for modifying this repository" in AGENTS.md.
