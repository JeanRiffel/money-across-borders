// The read-side (CQRS query) port for remittances — deliberately separate
// from domain/remittance/repository/remittance-repository.ts, which is the
// write-side port SendRemittanceUseCase persists through (Postgres, source
// of truth). This one is what GET /remittances reads from instead
// (Elasticsearch): a denormalized, eventually-consistent projection kept in
// sync by a Kafka consumer (see infra/events/consumers/
// remittance-completed-indexer.ts), not the aggregate's own persistence.
//
// Unlike EventPublisher, this port's methods are allowed to throw — a
// failed search should surface as a real error to the caller (there's no
// meaningful "silently return nothing" for a read the caller is explicitly
// asking for), whereas index() failing is the concern of whatever calls it
// (the consumer worker), not of this interface's contract.
export type RemittanceSearchDocument = {
  remittanceId: string;
  senderAccountId: string;
  recipientAccountId: string;
  status: string;
  sourceCurrency: string;
  sourceAmountMinorUnits: number;
  feeMinorUnits: number;
  destinationCurrency: string;
  convertedAmountMinorUnits: number;
  exchangeRate: number;
  createdAt: string;
};

export type RemittanceSearchQuery = {
  // Matches either sender or recipient — "remittances involving this
  // account", not "remittances sent by this account".
  accountId?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export interface RemittanceSearchIndex {
  index(document: RemittanceSearchDocument): Promise<void>;
  search(query: RemittanceSearchQuery): Promise<RemittanceSearchDocument[]>;
}
