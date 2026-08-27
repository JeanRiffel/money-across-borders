export class UserStatus {
  constructor(private id: number) {}

  static active(): UserStatus {
    return new UserStatus(1);
  }

  static suspended(): UserStatus {
    return new UserStatus(2);
  }

  getId(): number {
    return this.id;
  }

  isActive(): boolean {
    return this.id === 1;
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
      2: 'SUSPENDED',
    };
    return statusMap[this.id] || 'UNKNOWN';
  }
}
