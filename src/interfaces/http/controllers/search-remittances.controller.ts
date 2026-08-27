import { Request } from 'express';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { SearchRemittancesInput } from 'src/application/remittance/dto/search-remittances-input';
import { SearchRemittancesOutput } from 'src/application/remittance/dto/search-remittances-output';

export class SearchRemittancesController {
  constructor(
    private readonly searchRemittancesUseCase: UseCase<
      SearchRemittancesInput,
      SearchRemittancesOutput
    >
  ) {}

  async handle(req: Request): Promise<any> {
    try {
      // accountId is required (see SearchRemittancesInput's comment) —
      // without it this would return every account's remittances, and
      // there's no per-resource authorization layer yet to otherwise stop
      // that (see CLAUDE.md).
      const accountId = req.query.accountId as string | undefined;
      if (!accountId) {
        return { statusCode: 400, result: 'accountId query parameter is required' };
      }

      const input = SearchRemittancesInput.from({
        accountId,
        status: req.query.status as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: req.query.limit as string | undefined,
      });

      const result = await this.searchRemittancesUseCase.execute(input);
      return { statusCode: 200, result };
    } catch (error) {
      return { statusCode: 500, result: `Error on SearchRemittancesUseCase: ${error}` };
    }
  }
}
