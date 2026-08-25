export class SearchRemittancesInput {
  constructor(
    // Required, not optional — see SearchRemittancesController: without an
    // accountId filter this would return every account's remittances, and
    // there's no per-resource authorization layer yet (see CLAUDE.md) to
    // otherwise stop that.
    public readonly accountId: string,
    public readonly status?: string,
    public readonly from?: string,
    public readonly to?: string,
    public readonly limit?: number
  ) {}

  static from(raw: {
    accountId: string
    status?: string
    from?: string
    to?: string
    limit?: string | number
  }): SearchRemittancesInput {
    return new SearchRemittancesInput(
      raw.accountId,
      raw.status,
      raw.from,
      raw.to,
      raw.limit !== undefined ? Number(raw.limit) : undefined
    )
  }
}
