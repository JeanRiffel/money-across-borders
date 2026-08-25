import { OutboxEventRecord, OutboxRepository } from "../../../application/shared/events/outbox-repository";
import { getExecutor } from "../../config/database/postgresql/pg";

type OutboxEventRow = {
  id: string
  topic: string
  payload: Record<string, unknown>
  created_at: Date
}

function toRecord(row: OutboxEventRow): OutboxEventRecord {
  return {
    id: row.id,
    topic: row.topic,
    payload: row.payload,
    createdAt: row.created_at,
  }
}

export class PostgresOutboxRepository implements OutboxRepository {

  // Called via getExecutor(), same as every other Postgres*Repository — so
  // when this runs inside unitOfWork.runInTransaction(...) (the only place
  // CreateAccountUseCase calls it), it transparently joins that transaction
  // instead of auto-committing on its own connection. That's the entire
  // guarantee this pattern relies on: this INSERT either commits together
  // with the User + Account rows, or rolls back together with them — never
  // one without the other.
  async add(topic: string, payload: Record<string, unknown>): Promise<void> {
    await getExecutor().query(
      `INSERT INTO outbox_events (topic, payload) VALUES ($1, $2)`,
      [topic, JSON.stringify(payload)]
    )
  }

  // Used only by the relay process (see outbox-relay.ts), never inside a
  // business transaction — deliberately not called via getExecutor()'s
  // transaction-joining behavior for anything beyond that default pool
  // fallback, since the relay has no surrounding UnitOfWork of its own.
  async findUnpublished(limit: number): Promise<OutboxEventRecord[]> {
    const result = await getExecutor().query<OutboxEventRow>(
      `SELECT id, topic, payload, created_at FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    )
    return result.rows.map(toRecord)
  }

  async markPublished(id: string): Promise<void> {
    await getExecutor().query(
      `UPDATE outbox_events SET published_at = now() WHERE id = $1`,
      [id]
    )
  }
}
