import { buildComplianceModule } from 'src/main/compliance/compliance-module';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { SubmitKycInput } from 'src/application/compliance/dto/submit-kyc-input';
import { SubmitKycOutput } from 'src/application/compliance/dto/submit-kyc-output';
import { SystemClock } from '../time/system-clock';
import { postgresRegistry } from '../persistence/postgresql/postgres-registry';
import { redisRegistry } from '../persistence/redis/redis-registry';
import { MongoKycDossierRepository } from '../persistence/mongodb/mongo-kyc-dossier-repository';

export function createSubmitKycUseCase(): UseCase<SubmitKycInput, SubmitKycOutput> {
  const dependencies = {
    kycProfileRepository: postgresRegistry.kycProfileRepository,
    // First real consumer of Mongo in this codebase — see
    // mongo-kyc-dossier-repository.ts. Non-fatal: a down Mongo doesn't fail
    // KYC submission, just skips archiving that dossier (see its comment).
    kycDossierRepository: new MongoKycDossierRepository(),
    idempotencyRepository: redisRegistry.idempotencyRepository,
    clock: new SystemClock(),
  };

  return buildComplianceModule(dependencies);
}
