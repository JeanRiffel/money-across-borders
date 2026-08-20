import { v7 as uuidv7, validate as uuidValidate } from 'uuid'

export class LedgerEntryId {

  private constructor(private readonly value: string) {}

  static generate(): LedgerEntryId {
    return new LedgerEntryId(uuidv7())
  }

  static from(value: string): LedgerEntryId {
    if (!uuidValidate(value)) {
      throw new Error('Invalid LedgerEntryId format')
    }
    return new LedgerEntryId(value)
  }

  getValue(): string {
    return this.value
  }

  equals(other: LedgerEntryId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

}
