import { v7 as uuidv7, validate as uuidValidate } from 'uuid';

export class AccountId {
  private constructor(private readonly value: string) {}

  static generate(): AccountId {
    return new AccountId(uuidv7());
  }

  static from(value: string): AccountId {
    if (!uuidValidate(value)) {
      throw new Error('Invalid AccountId format');
    }
    return new AccountId(value);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: AccountId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
