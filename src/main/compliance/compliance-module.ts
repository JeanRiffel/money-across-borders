import { IdempotentDecorator } from 'src/application/shared/idempotency/idempotent-decorator';
import { SubmitKycUseCase } from 'src/application/compliance/uses-cases/submit-kyc-use-case';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { SubmitKycInput } from 'src/application/compliance/dto/submit-kyc-input';
import { SubmitKycOutput } from 'src/application/compliance/dto/submit-kyc-output';
import { KycProfileRepository } from 'src/domain/compliance/repository/kyc-profile-repository';
import { KycDossierRepository } from 'src/application/compliance/repositories/kyc-dossier-repository';
import { IdempotencyRepository } from 'src/application/repositories/idempotency-repository';
import { Clock } from 'src/domain/shared/clock';

export type ComplianceModuleDependencies = {
  kycProfileRepository: KycProfileRepository;
  kycDossierRepository: KycDossierRepository;
  idempotencyRepository: IdempotencyRepository;
  clock: Clock;
};

export function buildComplianceModule(
  deps: ComplianceModuleDependencies
): UseCase<SubmitKycInput & { idempotencyKey: string }, SubmitKycOutput> {
  const submitKycUseCase = new SubmitKycUseCase(
    deps.kycProfileRepository,
    deps.kycDossierRepository,
    deps.clock
  );

  const idempotentSubmitKyc = new IdempotentDecorator(submitKycUseCase, deps.idempotencyRepository);

  return idempotentSubmitKyc;
}
