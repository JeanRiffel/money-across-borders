import { Request } from 'express'
import { ValidationError } from '../../../src/domain/shared/errors'
import { WalletName } from '../../../src/domain/wallet/value-objects/wallet-name-value-object'
import { OpenWalletController } from '../../../src/interfaces/http/controllers/open-wallet.controller'

// Keep the controller mapping check free of logger transport worker threads.
jest.mock('../../../src/infra/observability/logger', () => ({
  logger: { error: jest.fn() },
}))

describe('WalletName', () => {
  const graphemes = [
    ['ASCII', 'a'],
    ['family emoji with ZWJ', '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'],
    ['Brazil flag', '\u{1F1E7}\u{1F1F7}'],
    ['precomposed accent', '\u{00E9}'],
    ['decomposed accent', 'e\u{0301}'],
  ]
  const invalidNames = [
    ['empty name', '', /empty|at least.*1|1.*40.*grapheme/i],
    ['whitespace-only name', '   ', /empty|at least.*1|1.*40.*grapheme/i],
    ['name over 40 graphemes', 'a'.repeat(41), /40.*grapheme|grapheme.*40/i],
    ['control character', 'My\u{0000}Savings', /control/i],
  ] as const

  it('should trim the ends and collapse internal spaces, tabs and newlines', () => {
    expect(WalletName.from('  My \u{0009}\u{000A} Savings  ').getValue()).toBe('My Savings')
  })

  it.each([
    ['non-breaking space', '\u{00A0}'],
    ['em space', '\u{2003}'],
    ['narrow non-breaking space', '\u{202F}'],
    ['ideographic space', '\u{3000}'],
    ['line and paragraph separators', '\u{2028}\u{2029}'],
    ['carriage return, vertical tab and form feed', '\u{000D}\u{000B}\u{000C}'],
  ])('should normalize %s before validating controls', (_label, whitespace) => {
    expect(WalletName.from(`${whitespace}My${whitespace}${whitespace}Savings${whitespace}`).getValue())
      .toBe('My Savings')
  })

  it('should validate the normalized length rather than the input length', () => {
    expect(WalletName.from(`  ${'a'.repeat(40)}  `).getValue()).toBe('a'.repeat(40))
    expect(WalletName.from(`My${' '.repeat(50)}Savings`).getValue()).toBe('My Savings')
  })

  it.each(['', '   ', '\u{0009}\u{000A}\u{00A0}\u{2003}'])(
    'should reject an empty name after normalization (%j)', name => {
      expect(() => WalletName.from(name)).toThrow(ValidationError)
    }
  )

  it.each(graphemes)('should accept one grapheme: %s', (_label, grapheme) => {
    expect(WalletName.from(grapheme).getValue()).toBe(grapheme)
  })

  it.each(graphemes)('should accept exactly 40 graphemes: %s', (_label, grapheme) => {
    const name = grapheme.repeat(40)
    expect(WalletName.from(name).getValue()).toBe(name)
  })

  it.each(graphemes)('should reject 41 graphemes: %s', (_label, grapheme) => {
    expect(() => WalletName.from(grapheme.repeat(41))).toThrow(ValidationError)
    expect(() => WalletName.from(grapheme.repeat(41)))
      .toThrow(/40.*grapheme|grapheme.*40/i)
  })

  it.each([
    ['accents', 'Poupan\u{00E7}a'],
    ['CJK', '\u{65C5}\u{884C}'],
    ['emoji', '\u{1F4B0}'],
    ['punctuation', 'Travel: (2026) / $!?'],
    ['format character ZWJ', 'My\u{200D}Wallet'],
  ])('should allow Unicode and preserve %s', (_label, name) => {
    expect(WalletName.from(name).getValue()).toBe(name)
  })

  it.each([
    ['NUL', '\u{0000}'],
    ['BEL', '\u{0007}'],
    ['backspace', '\u{0008}'],
    ['DEL', '\u{007F}'],
    ['C1 control', '\u{009F}'],
  ])('should reject remaining Cc characters: %s', (_label, control) => {
    for (const name of [`${control}Savings`, `My${control}Savings`, `Savings${control}`]) {
      expect(() => WalletName.from(name)).toThrow(ValidationError)
      expect(() => WalletName.from(name)).toThrow(/control/i)
    }
  })

  it.each(invalidNames)('should identify the failed rule for %s', (_label, name, message) => {
    expect(() => WalletName.from(name)).toThrow(ValidationError)
    expect(() => WalletName.from(name)).toThrow(message)
  })

  it.each(invalidNames)('should map the domain error for %s to HTTP 400', async (_label, name, message) => {
    // NW-02 does not wire names into the real use case/DTO (NW-03).
    // Exercise the existing mapping with a use case that invokes the value object.
    const execute = jest.fn(async () => {
      WalletName.from(name)
      throw new Error('Invalid wallet name was accepted')
    })
    const controller = new OpenWalletController({ execute })
    const req = {
      body: { accountId: '550e8400-e29b-41d4-a716-446655440000', currency: 'USD' },
      header: () => undefined,
    } as unknown as Request

    const response = await controller.handle(req)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(response.statusCode).toBe(400)
    expect(response.result).toMatch(message)
  })

  it('should compare normalized names case-insensitively', () => {
    const travel = WalletName.from('  Travel  ')
    const uppercase = WalletName.from('TRAVEL')

    expect(travel.equals(uppercase)).toBe(true)
    expect(uppercase.equals(travel)).toBe(true)
    expect(travel.equals(travel)).toBe(true)
    expect(travel.equals(WalletName.from('Savings'))).toBe(false)
    expect(WalletName.from('My\u{0009}Savings').equals(WalletName.from('MY SAVINGS'))).toBe(true)
    expect(WalletName.from('\u{00C9}pargne').equals(WalletName.from('\u{00E9}PARGNE'))).toBe(true)
  })

  it('should expose its normalized value without mutating it during comparison', () => {
    const travel = WalletName.from('  Travel  ')
    const uppercase = WalletName.from('TRAVEL')

    travel.equals(uppercase)

    expect(travel).toBeInstanceOf(WalletName)
    expect(travel.getValue()).toBe('Travel')
    expect(uppercase.getValue()).toBe('TRAVEL')
  })

  it('should trim NEXT LINE whitespace at both ends', () => {
    expect(WalletName.from('\u{0085}My Savings\u{0085}').getValue()).toBe('My Savings')
  })

  it('should collapse repeated internal NEXT LINE whitespace', () => {
    expect(WalletName.from('My\u{0085}\u{0085}Savings').getValue()).toBe('My Savings')
  })

  it('should reject a NEXT LINE-only name as empty rather than as a control character', () => {
    const createName = () => WalletName.from('\u{0085}\u{0085}')

    expect(createName).toThrow(ValidationError)
    expect(createName).toThrow(/empty|at least.*1|1.*40.*grapheme/i)
    expect(createName).not.toThrow(/control/i)
  })
})
