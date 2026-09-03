# 0009 — Request validation with zod, confined to each input DTO

## Status

Accepted

## Context

None of this project's 6 HTTP input DTOs (`CreateAccountInput`, `LoginInput`, `OpenWalletInput`,
`SubmitKycInput`, `SendRemittanceInput`, `SearchRemittancesInput`) validated the raw request data they were
built from — each `.from(raw: any)` factory just assigned properties. A malformed request (a missing field,
a string where a number was expected) wasn't caught at the boundary: it either produced a confusing
downstream failure, or reached a domain value object that throws a plain `Error` (e.g.
`Money.fromMinorUnits`), which every controller's catch block fails to recognize — its `instanceof` checks
only cover this project's own named domain errors — so it fell through to the generic 500 branch and leaked
an internal error message to the client, where a 400 was the right response.
`search-remittances.controller.ts` had one ad hoc manual check (`if (!accountId) → 400`) — the only existing
precedent, and inconsistent with every other controller.

## Decision

**Library: `zod`.** Chosen over `joi`/`yup` (the latter already sits, unused, as a transitive dependency —
see `package-lock.json`) for TypeScript-first static inference and being the most widely adopted option for
this exact "parse untrusted external input into a trusted internal shape" job. `zod` v4 (the version `npm
install zod` resolved to at the time of this change) ships a proper CommonJS entry (`main` /
`require` in its `package.json`), so it loads cleanly under this project's canonical CommonJS toolchain
(`ts-node`, Jest/`ts-jest`) — unlike the ESM-only `cockatiel` 4.x pitfall documented in
[0008](0008-resilience-layer.md), which needed a version pin to work around.

**Validation lives inside each input DTO's own `.from()`, not a separate interface-layer validation
module.** Each DTO defines a zod schema in the same file and calls a small shared helper,
`parseOrThrow(schema, raw)` (`src/application/shared/validation/parse-or-throw.ts`), which turns a failed
`safeParse` into a `ValidationError` (added to `src/domain/shared/errors.ts` alongside this project's other
shared error classes — matching existing precedent there, e.g. `IdempotencyKeyInFlightError`, rather than
splitting errors into a second, layer-pure module). This keeps `docs/architecture.md`'s existing DTO
convention intact ("input DTOs map from a raw request-shaped object") instead of introducing a parallel
validate-then-map pattern. Every controller gets one added `catch` branch,
`if (error instanceof ValidationError) return { statusCode: 400, ... }`, matching each controller's own
existing per-error-type style rather than a new centralized error-to-status mapper.

**Scope: request shape only, never business rules the domain already owns.** Schemas check types,
required-ness, and basic format (a UUID-shaped `accountId`, an integer `amountMinorUnits`, an email-shaped
`email`) — not whether a currency code is actually supported (`UnsupportedCurrencyError`, 422, via
`Currency.from()`), whether a wallet has sufficient funds (`InsufficientFundsError`), or a password-strength
policy this codebase has never enforced anywhere. The line: if the check already exists in a domain entity
or value object, the schema doesn't duplicate it.

## Alternatives considered

- **A global Express error-handling middleware** (a single `(err, req, res, next)` handler mapping every
  thrown error type to a status code). Rejected for this change — none exists today, every controller
  currently maps its own known errors to status codes independently (with subtly different fallback
  message formats per controller), and unifying that is a separate, larger refactor this change deliberately
  doesn't fold in. Adding a `ValidationError` branch to each controller's existing `catch` block stays
  consistent with the pattern that's actually there.
- **`joi`/`yup`.** `yup` was already present transitively (via another dependency, never imported by this
  project's own code) but has weaker TypeScript type inference than `zod`; `joi` has none. Neither offered a
  compelling reason to route around `zod`'s better ergonomics for this codebase's fully-TypeScript surface.
- **Duplicating business rules in the zod schemas** (e.g. an enum of supported currency codes, a minimum
  remittance amount). Rejected — the domain already enforces these, and duplicating them in a schema would
  create two sources of truth that could drift (e.g. a currency added to `SUPPORTED_CURRENCIES` but not to a
  schema enum).

## Consequences

- A new production dependency (`zod`), but confined in the same way `cockatiel` is: every schema lives next
  to the DTO it validates, and the zod-to-`ValidationError` conversion is centralized in one small helper —
  swapping the library later touches those files, not every controller.
- `search-remittances.controller.ts`'s one pre-existing ad hoc manual check (`if (!accountId) → 400`) is
  removed — `SearchRemittancesInput`'s schema now covers it the same way every other controller's DTO covers
  its own required fields, resolving that inconsistency.
- A handful of existing test fixtures that predated any validation had to be corrected where they exercised
  values that were never actually valid (e.g. a typo'd email in `create-acocunt-use-case.test.ts` that
  slipped through only because nothing checked email format before this change).
- Still no per-resource authorization layer and no global error-handling middleware — this change doesn't
  touch either; see `docs/known-issues.md` and AGENTS.md's "Known inconsistencies" for what remains open.
