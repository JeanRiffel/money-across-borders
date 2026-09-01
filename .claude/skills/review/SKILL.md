---
name: Review
description: Review the current diff against this project's architecture, financial invariants, concurrency/idempotency/transaction concerns, and security — read-only, never edits files
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(git status*)
---

Structured review pass for this repository specifically — general code quality is what `/code-review`
already covers; this skill exists for the risk areas that are unique to a Clean-Architecture, double-entry
financial system: invariant preservation, concurrency, idempotency, and transaction boundaries.

**This skill is read-only.** It reports findings; it never edits, formats, or fixes anything. If the user
wants fixes applied, that's a separate, explicit follow-up step — don't do it as part of this skill.

## What to look at

1. Get the diff to review:
   ```!
   git status
   ```
   ```!
   git diff main...HEAD
   ```
   If there's no divergence from `main` (e.g. reviewing uncommitted work), use `git diff` /
   `git diff --staged` instead.

2. For each changed file, weigh it against these, only where actually relevant to what changed:

   - **Correctness** — does the change do what it claims? Any off-by-one, wrong branch, or edge case
     (empty input, zero amount, same-currency remittance) left unhandled?
   - **Architecture** — does it respect the dependency rule (domain → application → infra, never reverse)?
     Does a new/changed use case follow the existing `UseCase<Input, Output>` shape, DTO conventions, and
     wiring order? See [docs/architecture.md](../../../docs/architecture.md).
   - **Financial invariants** — cross-check against [docs/invariants.md](../../../docs/invariants.md). Does
     the change touch a **Guaranteed** invariant (double-entry balancing, non-negative balance, idempotent
     claim/save/release, `UnitOfWork` atomicity)? If so, is it still guaranteed after the change, and is
     that made obvious in the diff rather than left to be inferred?
   - **Concurrency risk** — any new read-then-write on `wallets.balance_minor_units` (or another
     contended row) without going through the existing atomic/locking pattern? Compare against
     [docs/concurrency-lab.md](../../../docs/concurrency-lab.md)'s documented gap (no row lock on wallet
     reads today) — does this change make that gap worse, better, or unrelated?
   - **Idempotency** — does a new side-effecting use case go through `IdempotentDecorator` the same way the
     existing ones do? Does it rely on `input.idempotencyKey` being present rather than assuming a
     controller always supplies one?
   - **Transaction boundaries** — does a change spanning multiple repository writes that must succeed or
     fail together go through `UnitOfWork.runInTransaction()`? Does anything start its own transaction
     inside a `Postgres*Repository` method, breaking the "joins the caller's transaction via `getExecutor()`"
     contract?
   - **Security** — any secret/credential in the diff? Any authentication/authorization check weakened or
     removed (including building on top of the known `accountId`-vs-JWT gap as if it were fixed)? Any
     destructive DB operation reachable without explicit user action?
   - **Test coverage** — does the change have a matching test at the right level (in-memory unit test vs.
     `test:integration`/`test:concurrency` for real Postgres behavior)? See
     [.github/instructions/tests.instructions.md](../../../.github/instructions/tests.instructions.md).
   - **Unintended changes** — anything in the diff that isn't explained by the stated task: formatting-only
     changes to untouched files, drive-by renames, accidental dependency bumps, stray debug output.

3. Report findings grouped by severity (blocking correctness/invariant/security issues first, then
   architecture/style), each with the file/line and a one-line reason it matters. If nothing of substance is
   found, say so plainly rather than padding the report.

Don't run `npm run lint:fix`/`npm run format`/tests as part of this skill — that's `/lint-format` and
`/run-tests`. This skill's job is producing findings, not fixing them.
