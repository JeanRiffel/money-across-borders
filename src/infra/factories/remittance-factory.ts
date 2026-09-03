import {
  buildRemittanceModule,
  buildSearchRemittancesModule,
} from 'src/main/remittance/remittance-module';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { SendRemittanceInput } from 'src/application/remittance/dto/send-remittance-input';
import { SendRemittanceOutput } from 'src/application/remittance/dto/send-remittance-output';
import { SearchRemittancesInput } from 'src/application/remittance/dto/search-remittances-input';
import { SearchRemittancesOutput } from 'src/application/remittance/dto/search-remittances-output';
import { SystemClock } from '../time/system-clock';
import { postgresRegistry } from '../persistence/postgresql/postgres-registry';
import { redisRegistry } from '../persistence/redis/redis-registry';
import { MockExchangeRateProvider } from '../exchange/mock-exchange-rate-provider';
import { HttpExchangeRateProvider } from '../exchange/http-exchange-rate-provider';
import { ExchangeRateProvider } from 'src/application/shared/exchange/exchange-rate-provider';
import { InMemoryComplianceChecker } from '../compliance/in-memory-compliance-checker';
import { FlatPercentageFeeCalculator } from '../pricing/flat-percentage-fee-calculator';
import { ElasticsearchRemittanceSearchIndex } from '../persistence/elasticsearch/elasticsearch-remittance-search-index';

// FX_PROVIDER opt-in switch: defaults to the static MockExchangeRateProvider
// (unchanged production behavior) unless explicitly set to "http", which
// wires HttpExchangeRateProvider — a real HTTP call guarded by
// resilient-http-client.ts (timeout/retry/backoff/circuit breaker) — against
// FX_PROVIDER_URL (see fake-fx-server.ts / docs/resilience.md for what's
// meant to run at that URL; nothing does by default). Kept opt-in rather
// than the new default so this feature demonstrates the resilience layer
// without changing SendRemittanceUseCase's existing behavior/latency profile
// for every caller.
function createExchangeRateProvider(): ExchangeRateProvider {
  if (process.env.FX_PROVIDER === 'http') {
    return new HttpExchangeRateProvider(process.env.FX_PROVIDER_URL || 'http://localhost:4010');
  }
  return new MockExchangeRateProvider();
}

// No seedTreasuryWallets() call here (unlike the old in-memory-backed
// version of this factory): the treasury account + its per-currency wallets
// are seeded by migration 002_seed_treasury_wallets.sql instead, idempotently,
// as part of `npm run db:migrate` — see CLAUDE.md's Commands section.
export async function createSendRemittanceUseCase(): Promise<
  UseCase<SendRemittanceInput, SendRemittanceOutput>
> {
  const clock = new SystemClock();

  const dependencies = {
    walletRepository: postgresRegistry.walletRepository,
    ledgerRepository: postgresRegistry.ledgerRepository,
    remittanceRepository: postgresRegistry.remittanceRepository,
    exchangeRateProvider: createExchangeRateProvider(),
    complianceChecker: new InMemoryComplianceChecker(postgresRegistry.kycProfileRepository),
    feeCalculator: new FlatPercentageFeeCalculator(),
    // See the equivalent comment in account-factory.ts.
    idempotencyRepository: redisRegistry.idempotencyRepository,
    clock,
    unitOfWork: postgresRegistry.unitOfWork,
    // Transactional Outbox: remittance.completed is written here, inside the
    // same transaction as the wallet/ledger/remittance saves, instead of
    // being published to Kafka directly — see the constructor comment on
    // SendRemittanceUseCase. Same shared outboxRepository instance
    // account-factory.ts wires CreateAccountUseCase to (one outbox_events
    // table, a broker column distinguishes the two — see
    // migrations/005_add_outbox_broker_column.sql).
    // worker:outbox-relay-kafka (src/infra/events/consumers/
    // kafka-outbox-relay.ts) is the process that actually delivers these to
    // Kafka; worker:outbox-relay (RabbitMQ) is a separate process and never
    // touches these rows.
    outboxRepository: postgresRegistry.outboxRepository,
  };

  return buildRemittanceModule(dependencies);
}

// CQRS read side — reads from Elasticsearch only, never touches Postgres/
// Redis/Kafka. See remittance-completed-indexer.ts for how documents get
// into that index in the first place.
export function createSearchRemittancesUseCase(): UseCase<
  SearchRemittancesInput,
  SearchRemittancesOutput
> {
  return buildSearchRemittancesModule({
    remittanceSearchIndex: new ElasticsearchRemittanceSearchIndex(),
  });
}
