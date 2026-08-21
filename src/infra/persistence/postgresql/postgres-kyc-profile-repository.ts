import { KycProfile } from "../../../domain/compliance/entities/kyc-profile";
import { KycProfileRepository } from "../../../domain/compliance/repository/kyc-profile-repository";
import { KycProfileId } from "../../../domain/compliance/value-objects/kyc-profile-id-value-object";
import { KycStatus } from "../../../domain/compliance/value-objects/kyc-status-value-object";
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object";
import { getExecutor } from "../../config/database/postgresql/pg";

type KycProfileRow = {
  id: string
  account_id: string
  status_id: number
  full_name: string
  document_id: string
  verified_at: Date | null
  created_at: Date
}

function toKycProfile(row: KycProfileRow): KycProfile {
  return new KycProfile(
    KycProfileId.from(row.id),
    AccountId.from(row.account_id),
    new KycStatus(row.status_id),
    row.full_name,
    row.document_id,
    row.verified_at,
    row.created_at
  )
}

export class PostgresKycProfileRepository implements KycProfileRepository {

  // One profile per account (schema's UNIQUE (account_id)) — upsert BY
  // account_id, not by profile id, matching InMemoryKycProfileRepository's
  // findIndex-by-accountId-replace behavior.
  async save(profile: KycProfile): Promise<void> {
    await getExecutor().query(
      `INSERT INTO kyc_profiles (id, account_id, status_id, full_name, document_id, verified_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (account_id) DO UPDATE SET
         status_id = EXCLUDED.status_id,
         full_name = EXCLUDED.full_name,
         document_id = EXCLUDED.document_id,
         verified_at = EXCLUDED.verified_at`,
      [
        profile.getId().getValue(),
        profile.getAccountId().getValue(),
        profile.getStatus().getId(),
        profile.getFullName(),
        profile.getDocumentId(),
        profile.getVerifiedAt(),
        profile.getCreatedAt(),
      ]
    )
  }

  async findByAccountId(accountId: AccountId): Promise<KycProfile | null> {
    const result = await getExecutor().query<KycProfileRow>(
      `SELECT id, account_id, status_id, full_name, document_id, verified_at, created_at
       FROM kyc_profiles WHERE account_id = $1`,
      [accountId.getValue()]
    )
    return result.rows[0] ? toKycProfile(result.rows[0]) : null
  }
}
