export class SendRemittanceInput {
  constructor(
    public readonly senderAccountId: string,
    public readonly recipientAccountId: string,
    public readonly sourceCurrency: string,
    public readonly destinationCurrency: string,
    public readonly amountMinorUnits: number
  ) {}

  static from(raw: any): SendRemittanceInput {
    return new SendRemittanceInput(
      raw.senderAccountId,
      raw.recipientAccountId,
      raw.sourceCurrency,
      raw.destinationCurrency,
      raw.amountMinorUnits
    );
  }
}
