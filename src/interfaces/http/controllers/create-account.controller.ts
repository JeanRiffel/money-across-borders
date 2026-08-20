import { Request } from "express"
import { v4 as uuidv4 } from "uuid"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { CreateAccountInput } from "src/application/account/dto/create-account-input"
import { CreateAccountOutput } from "src/application/account/dto/create-account-output"

export class CreateAccountController {

  // Injected dependency is the idempotent-decorated module built by
  // account-module.ts (see account-factory.ts), not the raw CreateAccountUseCase
  // — typed here as the UseCase port it actually satisfies, plus the
  // idempotencyKey the decorator requires on its input.
  constructor(
    private readonly createAccountUseCase: UseCase<CreateAccountInput & { idempotencyKey: string }, CreateAccountOutput>
  ){}

  async handle(req: Request): Promise<any>{
    try {
      const input = CreateAccountInput.from(req.body)
      // Falls back to a fresh key per request (not a shared constant) so
      // clients that omit Idempotency-Key don't all collide on the same
      // cache entry — each such request is simply never deduplicated.
      const idempotencyKey = req.header('Idempotency-Key') ?? req.body.idempotencyKey ?? uuidv4()
      const result = await this.createAccountUseCase.execute({ ...input, idempotencyKey })

      return {
        statusCode: 201,
        result: result
      }
    }catch(error){
      return {
        statusCode: 500,
        result: `Error on createAccountUseCase: ${error} `
      }
    }

  }


}
