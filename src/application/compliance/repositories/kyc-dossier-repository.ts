export type KycDossierAttachment = {
  label: string;
  reference: string;
};

// Deliberately loose compared to KycProfile (a strict domain entity with
// private fields and get*() accessors) — this is the shape Mongo is good
// at: whatever a real submission actually carries (attachments,
// document type, free-form notes), without a schema migration every time
// that shape changes. KycProfile in Postgres stays the one thing
// ComplianceChecker and everything else in the domain actually reads —
// this is supporting material, an audit/reference archive, not a source of
// truth for any business rule.
export type KycDossier = {
  kycProfileId: string;
  accountId: string;
  fullName: string;
  documentId: string;
  documentType?: string;
  attachments: KycDossierAttachment[];
  notes?: string;
  submittedAt: string;
};

export interface KycDossierRepository {
  // Never throws — see MongoKycDossierRepository's comment. Archiving the
  // raw dossier is a non-critical side effect of KYC submission; a down
  // Mongo can't undo the KycProfile save SubmitKycUseCase already made in
  // Postgres, matching how Mongo has been non-fatal everywhere else in
  // this codebase (see server.ts).
  save(dossier: KycDossier): Promise<void>;
}
