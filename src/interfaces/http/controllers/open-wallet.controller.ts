import { Request } from "express"
import { v4 as uuidv4 } from "uuid"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { OpenWalletInput } from "src/application/wallet/dto/open-wallet-input"
import { OpenWalletOutput } from "src/application/wallet/dto/open-wallet-output"
import { WalletAlreadyExistsError, UnsupportedCurrencyError } from "src/domain/shared/errors"

export class OpenWalletController {

  constructor(
    private readonly openWalletUseCase: UseCase<OpenWalletInput & { idempotencyKey: string }, OpenWalletOutput>
  ) {}

  async handle(req: Request): Promise<any> {
    try {
      const input = OpenWalletInput.from(req.body)
      const idempotencyKey = req.header('Idempotency-Key') ?? req.body.idempotencyKey ?? uuidv4()
      const result = await this.openWalletUseCase.execute({ ...input, idempotencyKey })

      return { statusCode: 201, result }
    } catch (error) {
      if (error instanceof WalletAlreadyExistsError) {
        return { statusCode: 409, result: error.message }
      }
      if (error instanceof UnsupportedCurrencyError) {
        return { statusCode: 422, result: error.message }
      }
      return { statusCode: 500, result: `Error on OpenWalletUseCase: ${error}` }
    }
  }

}
