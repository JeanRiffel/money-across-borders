import { Remittance } from '../../../domain/remittance/entities/remittance'

export class SendRemittanceOutput {
  constructor(
    public readonly remittanceId: string,
    public readonly status: string,
    public readonly sourceCurrency: string,
    public readonly destinationCurrency: string,
    public readonly sourceAmountMinorUnits: number,
    public readonly feeMinorUnits: number,
    public readonly convertedAmountMinorUnits: number,
    public readonly exchangeRate: number,
    public readonly createdAt: string
  ) {}

  static from(remittance: Remittance): SendRemittanceOutput {
    return new SendRemittanceOutput(
      remittance.getId().getValue(),
      remittance.getStatus().getDescription(),
      remittance.getSourceAmount().getCurrency().getCode(),
      remittance.getConvertedAmount().getCurrency().getCode(),
      remittance.getSourceAmount().getAmountMinorUnits(),
      remittance.getFee().getAmountMinorUnits(),
      remittance.getConvertedAmount().getAmountMinorUnits(),
      remittance.getExchangeRate(),
      remittance.getCreatedAt().toISOString()
    )
  }
}
