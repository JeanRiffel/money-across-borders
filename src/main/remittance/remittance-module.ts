import { IdempotentDecorator } from 'src/application/shared/idempotency/idempotent-decorator';
import { SendRemittanceUseCase } from 'src/application/remittance/uses-cases/send-remittance-use-case';
import { UseCase } from 'src/application/shared/idempotency/common-use-case.';
import { SendRemittanceInput } from 'src/application/remittance/dto/send-remittance-input';
import { SendRemittanceOutput } from 'src/application/remittance/dto/send-remittance-output';
import { WalletRepository } from 'src/domain/wallet/repository/wallet-repository';
import { LedgerRepository } from 'src/domain/ledger/repository/ledger-repository';
import { LedgerService } from 'src/domain/ledger/services/ledger-service';
import { RemittanceRepository } from 'src/domain/remittance/repository/remittance-repository';
import { ExchangeRateProvider } from 'src/application/shared/exchange/exchange-rate-provider';
import { ComplianceChecker } from 'src/application/shared/compliance/compliance-checker';
import { FeeCalculator } from 'src/application/shared/pricing/fee-calculator';
import { IdempotencyRepository } from 'src/application/repositories/idempotency-repository';
import { UnitOfWork } from 'src/application/shared/transaction/unit-of-work';
import { EventPublisher } from 'src/application/shared/events/event-publisher';
import { Clock } from 'src/domain/shared/clock';
import { SearchRemittancesUseCase } from 'src/application/remittance/uses-cases/search-remittances-use-case';
import { SearchRemittancesInput } from 'src/application/remittance/dto/search-remittances-input';
import { SearchRemittancesOutput } from 'src/application/remittance/dto/search-remittances-output';
import { RemittanceSearchIndex } from 'src/application/remittance/repositories/remittance-search-index';

export type RemittanceModuleDependencies = {
  walletRepository: WalletRepository;
  ledgerRepository: LedgerRepository;
  remittanceRepository: RemittanceRepository;
  exchangeRateProvider: ExchangeRateProvider;
  complianceChecker: ComplianceChecker;
  feeCalculator: FeeCalculator;
  idempotencyRepository: IdempotencyRepository;
  clock: Clock;
  unitOfWork: UnitOfWork;
  eventPublisher: EventPublisher;
};

export function buildRemittanceModule(
  deps: RemittanceModuleDependencies
): UseCase<SendRemittanceInput & { idempotencyKey: string }, SendRemittanceOutput> {
  const ledgerService = new LedgerService(deps.ledgerRepository, deps.clock);

  const sendRemittanceUseCase = new SendRemittanceUseCase(
    deps.walletRepository,
    ledgerService,
    deps.remittanceRepository,
    deps.exchangeRateProvider,
    deps.complianceChecker,
    deps.feeCalculator,
    deps.clock,
    deps.unitOfWork,
    deps.eventPublisher
  );

  const idempotentSendRemittance = new IdempotentDecorator(
    sendRemittanceUseCase,
    deps.idempotencyRepository
  );

  return idempotentSendRemittance;
}

export type SearchRemittancesModuleDependencies = {
  remittanceSearchIndex: RemittanceSearchIndex;
};

// Deliberately separate from buildRemittanceModule above (own function, own
// dependency type) — this is the CQRS read side, wired to Elasticsearch
// (see remittance-search-index.ts), not to any of the Postgres/UnitOfWork/
// IdempotencyRepository dependencies the write side needs. Not wrapped in
// IdempotentDecorator either, same reasoning as LoginUseCase and
// SearchRemittancesUseCase's own comment: it's a GET, not a
// create-something-once action.
export function buildSearchRemittancesModule(
  deps: SearchRemittancesModuleDependencies
): UseCase<SearchRemittancesInput, SearchRemittancesOutput> {
  return new SearchRemittancesUseCase(deps.remittanceSearchIndex);
}
