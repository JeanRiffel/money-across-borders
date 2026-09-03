-- Lets outbox_events (see 003_create_outbox_events.sql) carry rows destined
-- for either message broker, instead of RabbitMQ-only. account.created
-- (CreateAccountUseCase) and remittance.completed (SendRemittanceUseCase)
-- now both go through the Transactional Outbox, but each is relayed by its
-- own separate, broker-specific process — outbox-relay.ts (RabbitMQ, npm
-- run worker:outbox-relay) and kafka-outbox-relay.ts (Kafka, npm run
-- worker:outbox-relay-kafka) — deliberately kept as two independent workers
-- rather than one broker-agnostic relay, so each can evolve its own
-- retry/batching/backoff behavior without the two brokers' concerns
-- entangled in shared code. `broker` is what tells each relay which rows
-- are its own to claim.
--
-- DEFAULT 'rabbitmq' backfills every existing row (all of them
-- account.created today) and means OutboxRepository.add()/findUnpublished()
-- callers that don't pass a broker keep behaving exactly as before this
-- migration — see PostgresOutboxRepository.

BEGIN;

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS broker TEXT NOT NULL DEFAULT 'rabbitmq'
    CHECK (broker IN ('rabbitmq', 'kafka'));

-- Composite partial index: each relay's poll query filters on its own
-- broker AND published_at IS NULL, so an index keyed (broker, created_at)
-- lets that be an index-only scan over just its rows instead of scanning
-- the broker-agnostic idx_outbox_events_unpublished index (kept below,
-- unchanged) and filtering broker out afterward.
CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished_broker
  ON outbox_events (broker, created_at)
  WHERE published_at IS NULL;

COMMIT;
