export type IdempotencyRecord<O = any> = {
  id?: string;
  key: string;
  request_hash?: string;
  response?: O;
  response_body?: string;
  status_code?: number;
  created_at?: Date;
};

export interface IdempotencyRepository<O = any> {
  findByKey(key: string): Promise<IdempotencyRecord<O> | null>;
  save(record: IdempotencyRecord<O>): Promise<void>;
  // Atomically reserves `key` — returns true if this call reserved it, false
  // if another caller already holds it (in flight or already completed).
  // This is the actual concurrency gate: without it, two requests sharing an
  // Idempotency-Key can both pass a plain findByKey() check before either
  // has saved a response, and both fully execute the wrapped use case.
  claim(key: string): Promise<boolean>;
  // Releases a reservation that never completed (the wrapped use case threw)
  // so a legitimate retry with the same key can claim it again. Must be a
  // no-op once a response has been saved for the key.
  release(key: string): Promise<void>;
}
