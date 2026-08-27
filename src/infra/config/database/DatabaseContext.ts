import { DatabaseStrategy } from './DatabaseStrategy';

export class DatabaseContext {
  private strategy: DatabaseStrategy;

  constructor(strategy: DatabaseStrategy) {
    this.strategy = strategy;
  }

  async connect() {
    await this.strategy.connect();
  }

  async disconnect() {
    await this.strategy.disconnect();
  }
}
