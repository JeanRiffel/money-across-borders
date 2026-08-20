import { v7 as uuidv7, validate as uuidValidate } from 'uuid'

export class KycProfileId {

  private constructor(private readonly value: string) {}

  static generate(): KycProfileId {
    return new KycProfileId(uuidv7())
  }

  static from(value: string): KycProfileId {
    if (!uuidValidate(value)) {
      throw new Error('Invalid KycProfileId format')
    }
    return new KycProfileId(value)
  }

  getValue(): string {
    return this.value
  }

  equals(other: KycProfileId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

}
