import {
  OutboxBroker,
  OutboxEventRecord,
  OutboxRepository,
} from '../../../application/shared/events/outbox-repository';
import { getExecutor } from '../../config/database/postgresql/pg';

type OutboxEventRow = {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  broker: OutboxBroker;
  created_at: Date;
};

function toRecord(row: OutboxEventRow): OutboxEventRecord {
  return {
    id: row.id,
    topic: row.topic,
    payload: row.payload,
    broker: row.broker,
    createdAt: row.created_at,
  };
}

export class PostgresOutboxRepository implements OutboxRepository {
  // Called via getExecutor(), same as every other Postgres*Repository — so
  // when this runs inside unitOfWork.runInTransaction(...) (CreateAccountUseCase
  // and SendRemittanceUseCase, today), it transparently joins that
  // transaction instead of auto-committing on its own connection. That's the
  // entire guarantee this pattern relies on: this INSERT either commits
  // together with the business rows it accompanies, or rolls back together
  // with them — never one without the other.
  async add(
    topic: string,
    payload: Record<string, unknown>,
    broker: OutboxBroker = 'rabbitmq'
  ): Promise<void> {
    await getExecutor().query(
      `INSERT INTO outbox_events (topic, payload, broker) VALUES ($1, $2, $3)`,
      [topic, JSON.stringify(payload), broker]
    );
  }

  // Used only by a relay process (rabbitmq-outbox-relay.ts for 'rabbitmq',
  // kafka-outbox-relay.ts for 'kafka'), never inside a business transaction
  // — deliberately not called via getExecutor()'s transaction-joining
  // behavior for anything beyond that default pool fallback, since a relay
  // has no surrounding UnitOfWork of its own. broker scopes each relay to
  // only the rows it's responsible for — see migrations/
  // 005_add_outbox_broker_column.sql.
  async findUnpublished(
    limit: number,
    broker: OutboxBroker = 'rabbitmq'
  ): Promise<OutboxEventRecord[]> {
    const result = await getExecutor().query<OutboxEventRow>(
      `SELECT id, topic, payload, broker, created_at FROM outbox_events
       WHERE published_at IS NULL AND broker = $2
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit, broker]
    );
    return result.rows.map(toRecord);
  }

  async markPublished(id: string): Promise<void> {
    await getExecutor().query(`UPDATE outbox_events SET published_at = now() WHERE id = $1`, [id]);
  }
}
