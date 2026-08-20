-- Seeds the reserved treasury account + one wallet per supported currency.
--
-- Mirrors seed-treasury-wallets.ts (the in-memory equivalent, run at
-- startup today): TREASURY_ACCOUNT_ID is a fixed anchor id, not a real
-- customer, and every currency in Currency.supportedCodes() gets one
-- wallet pre-funded with TREASURY_SEED_BALANCE_MINOR_UNITS. These wallets
-- are the FX/fee counterparty LedgerService posts through so each
-- currency's ledger nets to zero independently (see CLAUDE.md
-- "Cross-currency ledger balancing"). Without them, SendRemittanceUseCase
-- has nowhere to post the treasury leg of a transfer.
--
-- Safe to re-run: both inserts are idempotent (ON CONFLICT DO NOTHING) on
-- the same keys the app itself would look up by (accounts.id, and wallets'
-- (account_id, currency) unique constraint from 001_init_schema.sql).
--
-- Currency list and seed balance must stay in sync with
-- src/domain/shared/value-objects/currency-value-object.ts and
-- src/infra/persistence/in-memory/seed-treasury-wallets.ts if either changes.

BEGIN;

-- user_id is left NULL: treasury is a system account with no identity
-- owner, not a customer signup — see 001_init_schema.sql's note on why
-- accounts.user_id is nullable in the first place.
INSERT INTO accounts (id, user_id, status_id, created_at)
VALUES ('11111111-1111-4111-8111-111111111111', NULL, 1, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallets (id, account_id, currency, balance_minor_units, status_id, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'USD', 1000000000, 1, now()),
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'BRL', 1000000000, 1, now()),
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'EUR', 1000000000, 1, now()),
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'GBP', 1000000000, 1, now())
ON CONFLICT (account_id, currency) DO NOTHING;

COMMIT;
