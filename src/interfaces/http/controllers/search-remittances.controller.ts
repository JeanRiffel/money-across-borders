import { Request } from 'express';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { SearchRemittancesInput } from 'src/application/remittance/dto/search-remittances-input';
import { SearchRemittancesOutput } from 'src/application/remittance/dto/search-remittances-output';
import { ValidationError } from 'src/domain/shared/errors';

export class SearchRemittancesController {
  constructor(
    private readonly searchRemittancesUseCase: UseCase<
      SearchRemittancesInput,
      SearchRemittancesOutput
    >
  ) {}

  async handle(req: Request): Promise<any> {
    try {
      // accountId is required (see SearchRemittancesInput's comment and
      // schema) — without it this would return every account's
      // remittances, and there's no per-resource authorization layer yet
      // to otherwise stop that (see CLAUDE.md). A missing/malformed
      // accountId now surfaces as a ValidationError below, same as every
      // other input DTO.
      const input = SearchRemittancesInput.from({
        accountId: req.query.accountId as string | undefined,
        status: req.query.status as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: req.query.limit as string | undefined,
      });

      const result = await this.searchRemittancesUseCase.execute(input);
      return { statusCode: 200, result };
    } catch (error) {
      if (error instanceof ValidationError) {
        return { statusCode: 400, result: error.message };
      }
      return { statusCode: 500, result: `Error on SearchRemittancesUseCase: ${error}` };
    }
  }
}
