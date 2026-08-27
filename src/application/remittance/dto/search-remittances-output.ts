import { RemittanceSearchDocument } from '../repositories/remittance-search-index';

export class SearchRemittancesOutput {
  constructor(public readonly remittances: RemittanceSearchDocument[]) {}

  static from(documents: RemittanceSearchDocument[]): SearchRemittancesOutput {
    return new SearchRemittancesOutput(documents);
  }
}
