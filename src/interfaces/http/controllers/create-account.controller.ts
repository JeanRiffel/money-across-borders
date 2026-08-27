import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { CreateAccountInput } from 'src/application/account/dto/create-account-input';
import { CreateAccountOutput } from 'src/application/account/dto/create-account-output';
import { EmailAlreadyExistsError, IdempotencyKeyInFlightError } from 'src/domain/shared/errors';

// Postgres unique_violation. CreateAccountUseCase pre-checks email and
// throws EmailAlreadyExistsError for the common (non-racing) case; this is
// the fallback for the rare case where two signups for the same email race
// past that pre-check and the DB's UNIQUE(email) constraint is what actually
// catches it — without this, that race surfaced as an uncaught 500 with a
// raw Postgres error leaking to the client.
const POSTGRES_UNIQUE_VIOLATION = '23505';

export class CreateAccountController {
  // Injected dependency is the idempotent-decorated module built by
  // account-module.ts (see account-factory.ts), not the raw CreateAccountUseCase
  // — typed here as the UseCase port it actually satisfies, plus the
  // idempotencyKey the decorator requires on its input.
  constructor(
    private readonly createAccountUseCase: UseCase<
      CreateAccountInput & { idempotencyKey: string },
      CreateAccountOutput
    >
  ) {}

  async handle(req: Request): Promise<any> {
    try {
      const input = CreateAccountInput.from(req.body);
      // Falls back to a fresh key per request (not a shared constant) so
      // clients that omit Idempotency-Key don't all collide on the same
      // cache entry — each such request is simply never deduplicated.
      const idempotencyKey = req.header('Idempotency-Key') ?? req.body.idempotencyKey ?? uuidv4();
      const result = await this.createAccountUseCase.execute({ ...input, idempotencyKey });

      return {
        statusCode: 201,
        result: result,
      };
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        return { statusCode: 409, result: error.message };
      }
      if (error instanceof IdempotencyKeyInFlightError) {
        return { statusCode: 409, result: error.message };
      }
      if ((error as any)?.code === POSTGRES_UNIQUE_VIOLATION) {
        return { statusCode: 409, result: 'An account with this email already exists' };
      }
      return {
        statusCode: 500,
        result: `Error on createAccountUseCase: ${error} `,
      };
    }
  }
}
