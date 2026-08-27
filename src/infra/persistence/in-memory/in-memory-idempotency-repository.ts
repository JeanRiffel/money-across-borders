import { IdempotencyRepository } from '../../../application/repositories/idempotency-repository';

type Entry = { response: any; hasResponse: boolean };

export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private storage = new Map<string, Entry>();

  async claim(key: string): Promise<boolean> {
    if (this.storage.has(key)) return false;
    this.storage.set(key, { response: undefined, hasResponse: false });
    return true;
  }

  async save({ key, response }: { key: string; response: any }): Promise<void> {
    this.storage.set(key, { response, hasResponse: true });
  }

  async findByKey(key: string): Promise<any | null> {
    const entry = this.storage.get(key);
    return entry && entry.hasResponse ? entry.response : null;
  }

  async release(key: string): Promise<void> {
    const entry = this.storage.get(key);
    if (entry && !entry.hasResponse) {
      this.storage.delete(key);
    }
  }
}
