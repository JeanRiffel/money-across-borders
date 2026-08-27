export class OpenWalletInput {
  constructor(
    public readonly accountId: string,
    public readonly currency: string,
    public readonly initialBalanceMinorUnits: number
  ) {}

  // No funding/deposit rail exists in this MVP — initialBalanceMinorUnits is
  // a deliberate stand-in for "money already in this wallet" so the
  // remittance flow can be demoed without one. Defaults to 0.
  static from(raw: any): OpenWalletInput {
    return new OpenWalletInput(raw.accountId, raw.currency, raw.initialBalanceMinorUnits ?? 0);
  }
}
