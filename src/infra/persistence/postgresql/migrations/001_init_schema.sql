-- Money Across Borders — initial Postgres schema.
--
-- Mirrors the domain entities under src/domain/**/entities as they exist
-- today (see CLAUDE.md "Architecture"). This is the schema the *-factory.ts
-- files would need Postgres*Repository adapters to target — none of them
-- are wired to Postgres yet (account-factory.ts, wallet-factory.ts, and
-- remittance-factory.ts all still use the in-memory registry), so applying
-- this migration doesn't change app behavior by itself.
--
-- IDs are UUIDs (uuidv7, generated in application code via AccountId.generate()
-- etc.) rather than DB-generated, so no DEFAULT gen_random_uuid() on the
-- entity tables — the app always supplies the id on insert.
--
-- *_id "enum" columns (status_id, direction_id) store the same small
-- integers as the domain value objects' getId() (e.g. AccountStatus,
-- WalletStatus, EntryDirection, RemittanceStatus, KycStatus) rather than
-- text, to stay a direct mirror of those classes. See the comment on each
-- table for the mapping.

BEGIN;

-- UserStatus: 1=ACTIVE, 2=SUSPENDED
-- The identity/authentication aggregate — email + credentials. Deliberately
-- separate from `accounts` below (see domain/user/entities/user.ts and
-- domain/account/entities/account.ts for the split's rationale).
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  status_id      SMALLINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AccountStatus: 1=OPEN, 2=CLOSED, 3=PENDING
-- The financial/ledger relationship — what Wallet, Remittance, and
-- KycProfile actually reference. user_id is nullable: not every Account has
-- a human owner — the system treasury account (see
-- domain/wallet/treasury-account.ts, seeded in 002_seed_treasury_wallets.sql)
-- is an Account with no User at all.
CREATE TABLE IF NOT EXISTS accounts (
  id             UUID PRIMARY KEY,
  user_id        UUID REFERENCES users(id),
  status_id      SMALLINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- WalletStatus: 1=ACTIVE, 2=CLOSED
CREATE TABLE IF NOT EXISTS wallets (
  id                    UUID PRIMARY KEY,
  account_id            UUID NOT NULL REFERENCES accounts(id),
  currency              CHAR(3) NOT NULL,
  balance_minor_units   BIGINT NOT NULL CHECK (balance_minor_units >= 0),
  status_id             SMALLINT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One wallet per (account, currency) — matches
  -- WalletRepository.findByAccountIdAndCurrency / WalletAlreadyExistsError.
  UNIQUE (account_id, currency)
);
CREATE INDEX IF NOT EXISTS idx_wallets_account_id ON wallets(account_id);

-- EntryDirection: 1=DEBIT, 2=CREDIT
-- Append-only: LedgerEntry has no update path in the domain (see
-- ledger-entry.ts) — corrections are new offsetting entries, never UPDATEs
-- or DELETEs of existing rows.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                  UUID PRIMARY KEY,
  wallet_id           UUID NOT NULL REFERENCES wallets(id),
  direction_id        SMALLINT NOT NULL,
  amount_minor_units  BIGINT NOT NULL CHECK (amount_minor_units >= 0),
  currency            CHAR(3) NOT NULL,
  -- Groups the legs of one balanced posting together (see
  -- LedgerService.postBalancedEntries) — a remittance id for
  -- principal/settlement legs, not itself a foreign key since fee-only
  -- postings and other future transaction kinds may not have a remittance row.
  transaction_id      UUID NOT NULL,
  description         TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_id ON ledger_entries(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);

-- KycStatus: 1=PENDING, 2=VERIFIED, 3=REJECTED
CREATE TABLE IF NOT EXISTS kyc_profiles (
  id             UUID PRIMARY KEY,
  account_id     UUID NOT NULL UNIQUE REFERENCES accounts(id),
  status_id      SMALLINT NOT NULL,
  full_name      TEXT NOT NULL,
  document_id    TEXT NOT NULL,
  verified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RemittanceStatus: 1=COMPLETED, 2=REJECTED_COMPLIANCE,
--                   3=REJECTED_INSUFFICIENT_FUNDS, 4=FAILED
-- (PENDING has no id today — this MVP resolves remittances synchronously,
-- see remittance-status-value-object.ts.)
CREATE TABLE IF NOT EXISTS remittances (
  id                            UUID PRIMARY KEY,
  sender_account_id             UUID NOT NULL REFERENCES accounts(id),
  recipient_account_id          UUID NOT NULL REFERENCES accounts(id),
  source_wallet_id              UUID NOT NULL REFERENCES wallets(id),
  destination_wallet_id         UUID NOT NULL REFERENCES wallets(id),
  source_amount_minor_units     BIGINT NOT NULL,
  source_currency                CHAR(3) NOT NULL,
  fee_minor_units                BIGINT NOT NULL,
  fee_currency                   CHAR(3) NOT NULL,
  converted_amount_minor_units   BIGINT NOT NULL,
  destination_currency           CHAR(3) NOT NULL,
  exchange_rate                  NUMERIC(18, 8) NOT NULL,
  status_id                      SMALLINT NOT NULL,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_remittances_sender_account_id ON remittances(sender_account_id);
CREATE INDEX IF NOT EXISTS idx_remittances_recipient_account_id ON remittances(recipient_account_id);

-- Backs IdempotencyRepository / IdempotentDecorator (see
-- src/application/repositories/idempotency-repository.ts and
-- src/application/shared/idempotency/idempotent-decorator.ts). `key` is the
-- caller-supplied Idempotency-Key (or a generated UUID fallback — see
-- create-account.controller.ts and friends), looked up before re-running a
-- use case. response_body mirrors the interface's `response`/`response_body`
-- duality; stored as jsonb so a cache hit can be replayed as-is.
CREATE TABLE IF NOT EXISTS idempotency_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key            TEXT NOT NULL UNIQUE,
  request_hash   TEXT,
  response_body  JSONB,
  status_code    SMALLINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
