import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { RemittanceSearchIndex } from '../repositories/remittance-search-index';
import { SearchRemittancesInput } from '../dto/search-remittances-input';
import { SearchRemittancesOutput } from '../dto/search-remittances-output';

// Not wrapped in IdempotentDecorator, same reasoning as LoginUseCase (see
// user-module.ts): idempotency means "replay the same key, get back the
// same cached response", which is right for a request that changes
// something exactly once, and wrong for a GET/read — every call here should
// hit the index fresh, never replay a stale cached result.
export class SearchRemittancesUseCase implements UseCase<
  SearchRemittancesInput,
  SearchRemittancesOutput
> {
  constructor(private readonly remittanceSearchIndex: RemittanceSearchIndex) {}

  async execute(input: SearchRemittancesInput): Promise<SearchRemittancesOutput> {
    const documents = await this.remittanceSearchIndex.search({
      accountId: input.accountId,
      status: input.status,
      from: input.from,
      to: input.to,
      limit: input.limit,
    });

    return SearchRemittancesOutput.from(documents);
  }
}
