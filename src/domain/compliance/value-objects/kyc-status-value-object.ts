export class KycStatus {
  constructor(private id: number) {}

  static pending(): KycStatus {
    return new KycStatus(1);
  }

  static verified(): KycStatus {
    return new KycStatus(2);
  }

  static rejected(): KycStatus {
    return new KycStatus(3);
  }

  getId(): number {
    return this.id;
  }

  isVerified(): boolean {
    return this.id === 2;
  }

  toJSON() {
    return {
      id: this.id,
      description: this.getDescription(),
    };
  }

  getDescription(): string {
    const statusMap: Record<number, string> = {
      1: 'PENDING',
      2: 'VERIFIED',
      3: 'REJECTED',
    };
    return statusMap[this.id] || 'UNKNOWN';
  }
}
