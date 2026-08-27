import {
  ComplianceChecker,
  ComplianceCheckInput,
  ComplianceCheckResult,
} from '../../application/shared/compliance/compliance-checker';
import { KycProfileRepository } from '../../domain/compliance/repository/kyc-profile-repository';

// Amounts at or below this threshold (in the source currency's raw minor
// units — not FX-normalized, a documented MVP simplification) are allowed
// even without a VERIFIED KycProfile. Anything above requires verification.
// A real system would tier limits per currency/jurisdiction.
const UNVERIFIED_LIMIT_MINOR_UNITS = 100_000;

export class InMemoryComplianceChecker implements ComplianceChecker {
  constructor(private readonly kycProfileRepository: KycProfileRepository) {}

  async check(input: ComplianceCheckInput): Promise<ComplianceCheckResult> {
    const profile = await this.kycProfileRepository.findByAccountId(input.accountId);

    if (profile && profile.getStatus().isVerified()) {
      return { approved: true };
    }

    if (input.amount.getAmountMinorUnits() <= UNVERIFIED_LIMIT_MINOR_UNITS) {
      return { approved: true };
    }

    return {
      approved: false,
      reason: 'amount exceeds the limit allowed without a verified KYC profile',
    };
  }
}
