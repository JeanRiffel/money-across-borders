import { v7 as uuidv7, validate as uuidValidate } from 'uuid'

export class WalletId {

  private constructor(private readonly value: string) {}

  static generate(): WalletId {
    return new WalletId(uuidv7())
  }

  static from(value: string): WalletId {
    if (!uuidValidate(value)) {
      throw new Error('Invalid WalletId format')
    }
    return new WalletId(value)
  }

  getValue(): string {
    return this.value
  }

  equals(other: WalletId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

}
