import { Request } from "express"
import { v4 as uuidv4 } from "uuid"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { SubmitKycInput } from "src/application/compliance/dto/submit-kyc-input"
import { SubmitKycOutput } from "src/application/compliance/dto/submit-kyc-output"
import { IdempotencyKeyInFlightError } from "src/domain/shared/errors"

export class SubmitKycController {

  constructor(
    private readonly submitKycUseCase: UseCase<SubmitKycInput & { idempotencyKey: string }, SubmitKycOutput>
  ) {}

  async handle(req: Request): Promise<any> {
    try {
      const input = SubmitKycInput.from(req.body)
      const idempotencyKey = req.header('Idempotency-Key') ?? req.body.idempotencyKey ?? uuidv4()
      const result = await this.submitKycUseCase.execute({ ...input, idempotencyKey })

      return { statusCode: 201, result }
    } catch (error) {
      if (error instanceof IdempotencyKeyInFlightError) {
        return { statusCode: 409, result: error.message }
      }
      return { statusCode: 500, result: `Error on SubmitKycUseCase: ${error}` }
    }
  }

}
