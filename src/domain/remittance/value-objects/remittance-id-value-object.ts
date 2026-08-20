import { v7 as uuidv7, validate as uuidValidate } from 'uuid'

export class RemittanceId {

  private constructor(private readonly value: string) {}

  static generate(): RemittanceId {
    return new RemittanceId(uuidv7())
  }

  static from(value: string): RemittanceId {
    if (!uuidValidate(value)) {
      throw new Error('Invalid RemittanceId format')
    }
    return new RemittanceId(value)
  }

  getValue(): string {
    return this.value
  }

  equals(other: RemittanceId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

}
