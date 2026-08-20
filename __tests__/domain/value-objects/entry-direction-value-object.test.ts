import { EntryDirection } from '../../../src/domain/ledger/value-objects/entry-direction-value-object'

describe('EntryDirection', () => {
  it('should describe DEBIT and CREDIT', () => {
    expect(EntryDirection.debit().getDescription()).toEqual('DEBIT')
    expect(EntryDirection.credit().getDescription()).toEqual('CREDIT')
  })

  it('should expose isDebit/isCredit predicates', () => {
    expect(EntryDirection.debit().isDebit()).toBe(true)
    expect(EntryDirection.debit().isCredit()).toBe(false)
    expect(EntryDirection.credit().isCredit()).toBe(true)
    expect(EntryDirection.credit().isDebit()).toBe(false)
  })
})
