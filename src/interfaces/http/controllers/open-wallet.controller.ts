import { Request } from "express"
import { v4 as uuidv4 } from "uuid"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { OpenWalletInput } from "src/application/wallet/dto/open-wallet-input"
import { OpenWalletOutput } from "src/application/wallet/dto/open-wallet-output"
import { WalletAlreadyExistsError, UnsupportedCurrencyError, IdempotencyKeyInFlightError } from "src/domain/shared/errors"

// Postgres unique_violation. OpenWalletUseCase's find-then-insert isn't
// concurrency-safe on its own — two requests for the same (account,
// currency) can both pass the pre-check before either insert lands, and the
// DB's UNIQUE(account_id, currency) constraint is what actually stops the
// duplicate. Without this fallback, the losing request's raw unique-violation
// surfaced as an uncaught 500 instead of the same 409 the non-racing case
// returns via WalletAlreadyExistsError.
const POSTGRES_UNIQUE_VIOLATION = '23505'

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
      if (error instanceof IdempotencyKeyInFlightError) {
        return { statusCode: 409, result: error.message }
      }
      if ((error as any)?.code === POSTGRES_UNIQUE_VIOLATION) {
        return {
          statusCode: 409,
          result: `Account ${req.body.accountId} already has a wallet in ${req.body.currency}`,
        }
      }
      return { statusCode: 500, result: `Error on OpenWalletUseCase: ${error}` }
    }
  }

}
