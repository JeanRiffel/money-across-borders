import { UseCase } from "./common-use-case.";
import { IdempotencyRepository } from "../../repositories/idempotency-repository";

export class IdempotentDecorator<I, O> implements UseCase<I, O>{

  constructor(
    private useCase: UseCase<I, O>,
    private idempotencyRepository: IdempotencyRepository
  ){}

  async execute(input: any): Promise<O>{
    const key = input.idempotencyKey

    // findByKey resolves to the cached response value directly, not a
    // wrapping {response} record — see InMemoryIdempotencyRepository and its
    // test, which is the actual, tested contract. Reading `existing.response`
    // here (as the IdempotencyRecord<O> return type on the interface
    // suggests) silently returned undefined on every cache hit; this was
    // never caught because no controller exercised this path end-to-end
    // until the account/wallet/remittance controllers were wired up.
    const existing = await this.idempotencyRepository.findByKey(key)
    if(existing){
      return existing as O
    }

    const result = await this.useCase.execute(input)

    await this.idempotencyRepository.save({
      key,
      response: result
    } as any)

    return result
  }

}