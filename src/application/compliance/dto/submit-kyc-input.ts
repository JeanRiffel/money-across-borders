import { KycDossierAttachment } from "../repositories/kyc-dossier-repository"

export class SubmitKycInput {
  constructor(
    public readonly accountId: string,
    public readonly fullName: string,
    public readonly documentId: string,
    public readonly documentType?: string,
    public readonly attachments?: KycDossierAttachment[],
    public readonly notes?: string
  ) {}

  static from(raw: {
    accountId: string
    fullName: string
    documentId: string
    documentType?: string
    attachments?: KycDossierAttachment[]
    notes?: string
  }): SubmitKycInput {
    return new SubmitKycInput(
      raw.accountId,
      raw.fullName,
      raw.documentId,
      raw.documentType,
      raw.attachments,
      raw.notes
    )
  }
}
