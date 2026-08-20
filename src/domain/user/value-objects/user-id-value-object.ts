import { v7 as uuidv7, validate as uuidValidate } from 'uuid'

export class UserId {

  private constructor(private readonly value: string) {}

  static generate(): UserId {
    return new UserId(uuidv7())
  }

  static from(value: string): UserId {
    if (!uuidValidate(value)) {
      throw new Error('Invalid UserId format')
    }
    return new UserId(value)
  }

  getValue(): string {
    return this.value
  }

  equals(other: UserId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

}
