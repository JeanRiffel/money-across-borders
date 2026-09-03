import { z } from 'zod';
import { KycDossierAttachment } from '../repositories/kyc-dossier-repository';
import { parseOrThrow } from '../../shared/validation/parse-or-throw';

const kycDossierAttachmentSchema = z.object({
  label: z.string().min(1),
  reference: z.string().min(1),
});

const submitKycInputSchema = z.object({
  accountId: z.string().uuid(),
  fullName: z.string().min(1),
  documentId: z.string().min(1),
  documentType: z.string().min(1).optional(),
  attachments: z.array(kycDossierAttachmentSchema).optional(),
  notes: z.string().optional(),
});

export class SubmitKycInput {
  constructor(
    public readonly accountId: string,
    public readonly fullName: string,
    public readonly documentId: string,
    public readonly documentType?: string,
    public readonly attachments?: KycDossierAttachment[],
    public readonly notes?: string
  ) {}

  static from(raw: unknown): SubmitKycInput {
    const parsed = parseOrThrow(submitKycInputSchema, raw);
    return new SubmitKycInput(
      parsed.accountId,
      parsed.fullName,
      parsed.documentId,
      parsed.documentType,
      parsed.attachments,
      parsed.notes
    );
  }
}
