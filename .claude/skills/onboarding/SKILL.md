---
name: onboarding
description: Guide a new engineer interactively through the Money Across Borders onboarding path (product, architecture, financial invariants, dev environment, first contribution) — read-only, never edits files
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git status*), Bash(git log*), Bash(git show*)
---

Interactive walkthrough of the onboarding path defined in
[docs/onboarding/README.md](../../../docs/onboarding/README.md). That file is the source of truth for the
learning path and completion criteria — read it first and follow its steps in order; don't restate or
extend it here.

**This skill is read-only.** It explains, points at files, and asks questions; it never edits code, runs
migrations, or starts infrastructure. Commands that need Postgres/Redis/containers stay with their own
manual-only skills (`/db-migrate`, `/seed-data`, `/docker-stack`) — suggest them, don't run them.

## How to run the session

1. Read `docs/onboarding/README.md`. If `$ARGUMENTS` names a step (e.g. `3` or `invariants`), start there;
   otherwise ask the engineer what they already know and start at the first step they haven't covered.
2. For each step, read the documents it lists and walk the engineer through them in short chunks, pointing
   at concrete files and line ranges in `src/` rather than paraphrasing docs from memory — documentation is
   a discovery aid, not proof of current behavior.
3. End each step with one or two check questions taken from the README's completion criteria (e.g. "walk
   me through what happens on `POST /remittances`"). Correct misunderstandings against the actual source,
   especially anything that confuses **Intended** or **Known violation** with **Guaranteed** in
   `docs/invariants.md`.
4. For step 5 (first contribution), hand off to `/task-context <task>` for the chosen task — this skill
   doesn't replace it.
5. Close with a short summary: steps covered, open questions, and which completion criteria still need
   work.
