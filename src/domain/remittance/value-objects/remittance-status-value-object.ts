export class RemittanceStatus {
  constructor(private id: number) {}

  static completed(): RemittanceStatus {
    return new RemittanceStatus(1)
  }

  static rejectedCompliance(): RemittanceStatus {
    return new RemittanceStatus(2)
  }

  static rejectedInsufficientFunds(): RemittanceStatus {
    return new RemittanceStatus(3)
  }

  static failed(): RemittanceStatus {
    return new RemittanceStatus(4)
  }

  getId(): number {
    return this.id;
  }

  toJSON() {
    return {
      id: this.id,
      description: this.getDescription(),
    };
  }

  getDescription(): string {
    // PENDING is reserved for a future async settlement rail — this MVP's
    // remittances are always resolved synchronously, so only the terminal
    // statuses below are ever actually persisted.
    const statusMap: Record<number, string> = {
      1: 'COMPLETED',
      2: 'REJECTED_COMPLIANCE',
      3: 'REJECTED_INSUFFICIENT_FUNDS',
      4: 'FAILED',
    };
    return statusMap[this.id] || 'UNKNOWN';
  }
}
