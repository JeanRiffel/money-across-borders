import { randomUUID } from 'node:crypto';
import {
  OutboxEventRecord,
  OutboxRepository,
} from '../../../application/shared/events/outbox-repository';

// Mirrors the rest of the codebase's InMemory* fakes: a plain array instead
// of a Postgres table. There's no transaction/rollback concept here (see
// InMemoryUnitOfWork), so add() just appends unconditionally — good enough
// for exercising CreateAccountUseCase's happy path in tests without a real
// Postgres, same spirit as every other InMemory*Repository.
export class InMemoryOutboxRepository implements OutboxRepository {
  private events: OutboxEventRecord[] = [];
  private published: Set<string> = new Set();

  async add(topic: string, payload: Record<string, unknown>): Promise<void> {
    this.events.push({
      id: randomUUID(),
      topic,
      payload,
      createdAt: new Date(),
    });
  }

  async findUnpublished(limit: number): Promise<OutboxEventRecord[]> {
    return this.events.filter((event) => !this.published.has(event.id)).slice(0, limit);
  }

  async markPublished(id: string): Promise<void> {
    this.published.add(id);
  }

  // Test-only helper — lets a unit test assert an event was recorded
  // without needing findUnpublished()'s "still pending" filtering.
  getEvents(): ReadonlyArray<OutboxEventRecord> {
    return this.events;
  }
}
