import { SubmitKycInput } from '../../../../src/application/compliance/dto/submit-kyc-input'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'
import { ValidationError } from '../../../../src/domain/shared/errors'

describe('SubmitKycInput.from', () => {
  it('builds an input from a valid raw request body, including optional fields', () => {
    const accountId = AccountId.generate().getValue()

    const input = SubmitKycInput.from({
      accountId,
      fullName: 'Jane Doe',
      documentId: 'DOC-123',
      documentType: 'passport',
      attachments: [{ label: 'front', reference: 's3://bucket/front.png' }],
      notes: 'submitted via mobile app',
    })

    expect(input.accountId).toEqual(accountId)
    expect(input.fullName).toEqual('Jane Doe')
    expect(input.documentType).toEqual('passport')
    expect(input.attachments).toEqual([{ label: 'front', reference: 's3://bucket/front.png' }])
  })

  it('builds an input from a valid raw request body with only the required fields', () => {
    const accountId = AccountId.generate().getValue()

    const input = SubmitKycInput.from({ accountId, fullName: 'Jane Doe', documentId: 'DOC-123' })

    expect(input.documentType).toBeUndefined()
    expect(input.attachments).toBeUndefined()
  })

  it('rejects a missing fullName', () => {
    expect(() => SubmitKycInput.from({
      accountId: AccountId.generate().getValue(),
      documentId: 'DOC-123',
    })).toThrow(/fullName/)
  })

  it('rejects a malformed attachment', () => {
    expect(() => SubmitKycInput.from({
      accountId: AccountId.generate().getValue(),
      fullName: 'Jane Doe',
      documentId: 'DOC-123',
      attachments: [{ label: 'front' }],
    })).toThrow(ValidationError)
  })
})
