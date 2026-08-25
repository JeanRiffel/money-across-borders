import { KycDossier, KycDossierRepository } from "../../../application/compliance/repositories/kyc-dossier-repository"
import { MongoDatabaseSingleton } from "../../config/database/mongo-database-sigleton"
import { logger } from "../../observability/logger"

const COLLECTION = 'kyc_dossiers'

export class MongoKycDossierRepository implements KycDossierRepository {

  // Never throws (see KycDossierRepository's contract comment) — catches
  // its own connection/write failures and logs, matching every other
  // non-fatal Mongo touchpoint in this codebase (see server.ts: Mongo is
  // logged-not-fatal at boot, and this is the first thing that actually
  // writes to it since).
  async save(dossier: KycDossier): Promise<void> {
    try {
      const mongoDatabase = await MongoDatabaseSingleton.getInstance()
      const db = await mongoDatabase.getDb()
      // Keyed by kycProfileId so a resubmission (see SubmitKycUseCase's
      // id-reuse comment) overwrites the same dossier document instead of
      // accumulating duplicates.
      await db.collection(COLLECTION).replaceOne(
        { kycProfileId: dossier.kycProfileId },
        dossier,
        { upsert: true }
      )
    } catch (error) {
      logger.warn({ error, kycProfileId: dossier.kycProfileId }, 'Failed to archive KYC dossier to MongoDB')
    }
  }

}
