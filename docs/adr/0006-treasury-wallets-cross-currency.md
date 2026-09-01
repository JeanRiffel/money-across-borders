# 0006 — System-owned treasury wallets for cross-currency ledger balancing

## Status

Accepted

## Context

Double-entry bookkeeping requires every posting to net to zero — but only *within* a currency (see
`LedgerService.postBalancedEntries()`'s `assertBalancedPerCurrency`). A remittance from a BRL wallet to a
USD wallet can't be expressed as one balanced posting: debiting BRL and crediting USD are two different
currencies, neither of which nets to zero on its own if they're the only two legs.

## Decision

The system owns one wallet per supported currency (`domain/wallet/treasury-account.ts`,
`TREASURY_ACCOUNT_ID`, seeded via `migrations/002_seed_treasury_wallets.sql` /
`seed-treasury-wallets.ts`), acting as the FX/fee counterparty for every remittance. A cross-currency
remittance posts two independently-balanced legs: source currency moves sender-wallet → source-currency
treasury wallet; destination currency moves destination-currency treasury wallet → recipient wallet. Each
currency's legs net to zero on their own, satisfying `LedgerService`'s invariant, while the *economic*
transfer still crosses currencies. A same-currency remittance skips treasury for the principal (direct
wallet-to-wallet) and routes only the fee through it. See `SendRemittanceUseCase.doExecute()` for the exact
leg layout, and the "Cross-currency ledger balancing" bullet in [architecture.md](../architecture.md).

## Alternatives considered

- **A single global "suspense"/clearing account instead of per-currency treasury wallets.** Rejected —
  would immediately mix currencies in one wallet's balance, which is exactly what `Wallet`'s
  same-currency invariant (`assertSameCurrency`) and the per-currency-zero-sum ledger check are designed to
  prevent. Per-currency wallets keep every wallet, treasury included, single-currency.
- **Relax the ledger to allow cross-currency postings that net to zero in a converted "reference" currency
  instead of per-currency.** Rejected — that would hide currency-specific exposure (how much BRL vs. USD the
  system is actually holding) behind a single converted number, defeating the purpose of tracking each
  currency's ledger independently.

## Consequences

- Every supported currency needs a treasury wallet pre-funded before any cross-currency remittance in that
  currency can be sent — `SendRemittanceUseCase` throws `WalletNotFoundError` for a missing treasury wallet,
  the same as it would for a missing customer wallet.
- Treasury wallets are seeded once with a large fixed balance and are not continuously rebalanced against a
  real FX counterparty — a deliberate MVP simplification (mocked FX, not a live feed) documented in
  [docs/known-issues.md](../known-issues.md) and [docs/invariants.md](../invariants.md)'s "Remittance"
  section. In a real system, treasury positions would need active management (hedging, rebalancing,
  alerting on drawdown) that this project doesn't attempt to model.
- The same pattern is reused outside the live write path by `npm run seed`'s funding generator (crediting a
  newly-seeded wallet's opening balance from the same-currency treasury wallet) specifically to keep seeded
  wallet balances reconcilable against ledger entries — see [docs/seed.md](../seed.md).
