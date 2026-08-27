import { Money } from '../../../domain/shared/value-objects/money-value-object';

export interface FeeCalculator {
  calculate(amount: Money): Money;
}
