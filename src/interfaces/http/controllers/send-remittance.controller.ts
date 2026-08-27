import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { SendRemittanceInput } from 'src/application/remittance/dto/send-remittance-input';
import { SendRemittanceOutput } from 'src/application/remittance/dto/send-remittance-output';
import {
  ComplianceRejectedError,
  InsufficientFundsError,
  WalletNotFoundError,
  RecipientWalletNotFoundError,
  UnsupportedCurrencyError,
  ExchangeRateNotAvailableError,
  IdempotencyKeyInFlightError,
} from 'src/domain/shared/errors';

export class SendRemittanceController {
  constructor(
    private readonly sendRemittanceUseCase: UseCase<
      SendRemittanceInput & { idempotencyKey: string },
      SendRemittanceOutput
    >
  ) {}

  async handle(req: Request): Promise<any> {
    try {
      const input = SendRemittanceInput.from(req.body);
      const idempotencyKey = req.header('Idempotency-Key') ?? req.body.idempotencyKey ?? uuidv4();
      const result = await this.sendRemittanceUseCase.execute({ ...input, idempotencyKey });

      return { statusCode: 201, result };
    } catch (error) {
      if (error instanceof ComplianceRejectedError) {
        return { statusCode: 403, result: error.message };
      }
      if (error instanceof InsufficientFundsError) {
        return { statusCode: 422, result: error.message };
      }
      if (error instanceof WalletNotFoundError || error instanceof RecipientWalletNotFoundError) {
        return { statusCode: 404, result: error.message };
      }
      if (
        error instanceof UnsupportedCurrencyError ||
        error instanceof ExchangeRateNotAvailableError
      ) {
        return { statusCode: 422, result: error.message };
      }
      if (error instanceof IdempotencyKeyInFlightError) {
        return { statusCode: 409, result: error.message };
      }
      return { statusCode: 500, result: `Error on SendRemittanceUseCase: ${error}` };
    }
  }
}
