export class EntryDirection {
  constructor(private id: number) {}

  static debit(): EntryDirection {
    return new EntryDirection(1);
  }

  static credit(): EntryDirection {
    return new EntryDirection(2);
  }

  getId(): number {
    return this.id;
  }

  isDebit(): boolean {
    return this.id === 1;
  }

  isCredit(): boolean {
    return this.id === 2;
  }

  toJSON() {
    return {
      id: this.id,
      description: this.getDescription(),
    };
  }

  getDescription(): string {
    const directionMap: Record<number, string> = {
      1: 'DEBIT',
      2: 'CREDIT',
    };
    return directionMap[this.id] || 'UNKNOWN';
  }
}
