BEGIN;

-- Transactional Outbox: backs OutboxRepository (see
-- src/application/shared/events/outbox-repository.ts). CreateAccountUseCase
-- writes account.created here in the *same* Postgres transaction as the
-- User + Account saves (via UnitOfWork), instead of publishing to RabbitMQ
-- directly — so the event's existence is as durable as the row it
-- accompanies, closing the "commit succeeds, publish silently fails/never
-- runs" gap direct EventPublisher.publish() calls have (see CLAUDE.md's
-- EventPublisher bullet). A separate relay process (npm run
-- worker:outbox-relay, src/infra/events/consumers/outbox-relay.ts) is the
-- only thing that ever reads unpublished rows here and actually calls
-- RabbitMQ, retrying on its next poll if a publish attempt fails rather
-- than marking the row published.
CREATE TABLE IF NOT EXISTS outbox_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

-- Partial index: the relay only ever queries "oldest unpublished rows", and
-- published rows (the overwhelming majority over time) are never scanned by
-- it again, so there's no reason to carry them in this index.
CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished
  ON outbox_events (created_at)
  WHERE published_at IS NULL;

COMMIT;
