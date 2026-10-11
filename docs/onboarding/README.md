# Engineering Onboarding — Money Across Borders

## Purpose

Help new engineers become productive while preserving the project's architectural, financial, and security constraints.

This onboarding is AI-assisted, but engineers remain responsible for understanding, validating, and approving changes.

## Learning path

### 1. Understand the product
- Read `README.md`.
- Understand the account, wallet, ledger, exchange, compliance, and remittance domains.
- Explain the main remittance flow.

### 2. Understand the architecture
- Read `AGENTS.md` and `docs/architecture.md`.
- Understand dependency boundaries, Unit of Work, Transactional Outbox, and messaging.
- Consult ADRs when the rationale behind a decision is needed.

### 3. Understand financial correctness
- Read `docs/invariants.md` and `docs/known-issues.md`.
- Distinguish implemented guarantees from intended behavior and known gaps.
- Identify authorization and concurrency risks.

### 4. Prepare the development environment
- Follow `docs/infrastructure.md`.
- Validate required dependencies and environment variables.
- Run the relevant tests and record the results.

### 5. Make the first contribution
- Select a small, well-defined task.
- Use the `task-context` skill.
- Write or review acceptance criteria before implementation.
- Follow `docs/workflow.md` and `docs/definition-of-done.md`.
- Submit changes for review.

## Completion criteria

An engineer is ready to contribute when they can:

- Explain the remittance flow and its financial invariants.
- Locate the relevant code for a task.
- Run the appropriate validation commands.
- Identify known risks and avoid treating intended behavior as guaranteed.
- Follow the project's AI-assisted development workflow.

## Source of truth

This document is a learning guide, not a replacement for `AGENTS.md`, architecture documentation, current source code, or tests.
