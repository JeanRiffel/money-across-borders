import { WalletId } from '../../../src/domain/wallet/value-objects/wallet-id-value-object'

describe('WalletId', () => {
  it('should generate a valid, unique id', () => {
    const a = WalletId.generate()
    const b = WalletId.generate()
    expect(a.getValue()).not.toEqual(b.getValue())
  })

  it('should round-trip through from()/getValue()', () => {
    const generated = WalletId.generate()
    const rebuilt = WalletId.from(generated.getValue())
    expect(rebuilt.equals(generated)).toBe(true)
  })

  it('should reject an invalid id format', () => {
    expect(() => WalletId.from('not-a-uuid')).toThrow('Invalid WalletId format')
  })
})
