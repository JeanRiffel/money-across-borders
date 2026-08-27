import { AccountId } from '../../../domain/account/value-objects/account-id-value-object';
import { Money } from '../../../domain/shared/value-objects/money-value-object';

export type ComplianceCheckInput = {
  accountId: AccountId;
  amount: Money;
};

export type ComplianceCheckResult = {
  approved: boolean;
  reason?: string;
};

export interface ComplianceChecker {
  check(input: ComplianceCheckInput): Promise<ComplianceCheckResult>;
}
