-- Adds an optimistic-concurrency version column to `wallets`.
--
-- Purely additive: NOT NULL with a DEFAULT, so every existing row (and every
-- existing INSERT in PostgresWalletRepository.save(), which lists its
-- columns explicitly) keeps working unchanged. Nothing in the production
-- write path reads or increments this column today — it exists only for the
-- concurrency laboratory (see docs/concurrency-lab.md and
-- src/infra/persistence/postgresql/concurrency-lab/), which demonstrates
-- version-based optimistic updates directly against this real table via its
-- own repositories, without touching PostgresWalletRepository/
-- SendRemittanceUseCase.

BEGIN;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

COMMIT;
