import { UseCase } from './common-use-case.';
import { IdempotencyRepository } from '../../repositories/idempotency-repository';
import { IdempotencyKeyInFlightError } from '../../../domain/shared/errors';

export class IdempotentDecorator<I, O> implements UseCase<I, O> {
  constructor(
    private useCase: UseCase<I, O>,
    private idempotencyRepository: IdempotencyRepository
  ) {}

  async execute(input: any): Promise<O> {
    const key = input.idempotencyKey;

    // claim() is the real concurrency gate (an atomic reservation, backed by
    // the idempotency_records.key UNIQUE constraint on Postgres) — a plain
    // findByKey()-then-execute race let two requests sharing an
    // Idempotency-Key both slip past the check before either had saved a
    // response, so both fully executed the wrapped use case (e.g. two
    // committed remittances for what the client believed was one request).
    const claimed = await this.idempotencyRepository.claim(key);
    if (!claimed) {
      // Someone else holds this key already. If they've finished, replay
      // their response. If not, fail closed rather than risk re-running a
      // side-effecting use case a second time for the same key — the caller
      // is expected to retry.
      //
      // findByKey resolves to the cached response value directly, not a
      // wrapping {response} record — see InMemoryIdempotencyRepository and
      // its test, which is the actual, tested contract. Reading
      // `existing.response` here (as the IdempotencyRecord<O> return type on
      // the interface suggests) silently returned undefined on every cache
      // hit; this was never caught because no controller exercised this path
      // end-to-end until the account/wallet/remittance controllers were
      // wired up.
      const existing = await this.idempotencyRepository.findByKey(key);
      if (existing) {
        return existing as O;
      }
      throw new IdempotencyKeyInFlightError(key);
    }

    try {
      const result = await this.useCase.execute(input);

      await this.idempotencyRepository.save({
        key,
        response: result,
      } as any);

      return result;
    } catch (error) {
      // Release the reservation so a retry with the same key (e.g. after a
      // definitive business-rule rejection like insufficient funds) isn't
      // permanently stuck behind a claim that never completed. Note: if the
      // process crashes between claim() and this catch running, the
      // reservation is never released — a later retry with the same key will
      // see it as still in flight (IdempotencyKeyInFlightError) rather than
      // silently re-executing. That's the deliberate trade-off: fail closed,
      // not double-spend.
      await this.idempotencyRepository.release(key);
      throw error;
    }
  }
}
