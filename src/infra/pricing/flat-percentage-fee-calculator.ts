import { FeeCalculator } from '../../application/shared/pricing/fee-calculator';
import { Money } from '../../domain/shared/value-objects/money-value-object';

const FEE_PERCENTAGE = 0.005; // flat 0.5%, mocked pricing for this showcase

export class FlatPercentageFeeCalculator implements FeeCalculator {
  calculate(amount: Money): Money {
    return amount.multiply(FEE_PERCENTAGE);
  }
}
