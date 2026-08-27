export class WalletStatus {
  constructor(private id: number) {}

  static active(): WalletStatus {
    return new WalletStatus(1);
  }

  static closed(): WalletStatus {
    return new WalletStatus(2);
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
    const statusMap: Record<number, string> = {
      1: 'ACTIVE',
      2: 'CLOSED',
    };
    return statusMap[this.id] || 'UNKNOWN';
  }
}
