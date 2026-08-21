import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { AccountId } from "../../../domain/account/value-objects/account-id-value-object"
import { Currency } from "../../../domain/shared/value-objects/currency-value-object"
import { Money } from "../../../domain/shared/value-objects/money-value-object"
import { Wallet } from "../../../domain/wallet/entities/wallet"
import { WalletRepository } from "../../../domain/wallet/repository/wallet-repository"
import { TREASURY_ACCOUNT_ID } from "../../../domain/wallet/treasury-account"
import { LedgerService, LedgerLegDraft } from "../../../domain/ledger/services/ledger-service"
import { EntryDirection } from "../../../domain/ledger/value-objects/entry-direction-value-object"
import { Remittance } from "../../../domain/remittance/entities/remittance"
import { RemittanceId } from "../../../domain/remittance/value-objects/remittance-id-value-object"
import { RemittanceStatus } from "../../../domain/remittance/value-objects/remittance-status-value-object"
import { RemittanceRepository } from "../../../domain/remittance/repository/remittance-repository"
import { ExchangeRateProvider } from "../../shared/exchange/exchange-rate-provider"
import { ComplianceChecker } from "../../shared/compliance/compliance-checker"
import { FeeCalculator } from "../../shared/pricing/fee-calculator"
import { Clock } from "../../../domain/shared/clock"
import { UnitOfWork } from "../../shared/transaction/unit-of-work"
import {
  WalletNotFoundError,
  RecipientWalletNotFoundError,
  ComplianceRejectedError,
} from "../../../domain/shared/errors"
import { SendRemittanceInput } from "../dto/send-remittance-input"
import { SendRemittanceOutput } from "../dto/send-remittance-output"

export class SendRemittanceUseCase implements UseCase<SendRemittanceInput, SendRemittanceOutput> {

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerService: LedgerService,
    private readonly remittanceRepository: RemittanceRepository,
    private readonly exchangeRateProvider: ExchangeRateProvider,
    private readonly complianceChecker: ComplianceChecker,
    private readonly feeCalculator: FeeCalculator,
    private readonly clock: Clock,
    private readonly unitOfWork: UnitOfWork
  ) {}

  // Wrapped in a single DB transaction (see UnitOfWork): a failure anywhere
  // in here — after some but not all of the wallet/ledger/remittance saves
  // below have run — rolls back everything instead of leaving a partially
  // posted remittance. The in-memory implementation is a no-op passthrough,
  // so this changes nothing about how tests exercise this use case.
  async execute(input: SendRemittanceInput): Promise<SendRemittanceOutput> {
    return this.unitOfWork.runInTransaction(() => this.doExecute(input))
  }

  private async doExecute(input: SendRemittanceInput): Promise<SendRemittanceOutput> {
    const senderAccountId = AccountId.from(input.senderAccountId)
    const recipientAccountId = AccountId.from(input.recipientAccountId)
    const sourceCurrency = Currency.from(input.sourceCurrency)
    const destinationCurrency = Currency.from(input.destinationCurrency)

    const sourceWallet = await this.walletRepository.findByAccountIdAndCurrency(senderAccountId, sourceCurrency)
    if (!sourceWallet) {
      throw new WalletNotFoundError(`${input.senderAccountId} (${input.sourceCurrency})`)
    }

    const destinationWallet = await this.walletRepository.findByAccountIdAndCurrency(recipientAccountId, destinationCurrency)
    if (!destinationWallet) {
      throw new RecipientWalletNotFoundError(input.recipientAccountId, input.destinationCurrency)
    }

    const amount = Money.fromMinorUnits(input.amountMinorUnits, sourceCurrency)

    const compliance = await this.complianceChecker.check({ accountId: senderAccountId, amount })
    if (!compliance.approved) {
      throw new ComplianceRejectedError(compliance.reason ?? 'sender not approved to send this amount')
    }

    const fee = this.feeCalculator.calculate(amount)
    const isSameCurrency = sourceCurrency.equals(destinationCurrency)

    const treasurySourceWallet = await this.getTreasuryWallet(sourceCurrency)
    const treasuryDestinationWallet = isSameCurrency ? treasurySourceWallet : await this.getTreasuryWallet(destinationCurrency)

    const convertedAmount = isSameCurrency
      ? amount
      : (await this.exchangeRateProvider.getRate(sourceCurrency, destinationCurrency)).convert(amount)
    const exchangeRateValue = isSameCurrency
      ? 1
      : convertedAmount.getAmountMinorUnits() / amount.getAmountMinorUnits()

    // Debit the sender once for principal + fee; InsufficientFundsError is
    // thrown here (via Wallet.debit) before anything is persisted.
    const updatedSourceWallet = sourceWallet.debit(amount.add(fee))

    const remittanceId = RemittanceId.generate()
    const transactionId = remittanceId.getValue()

    const legs: LedgerLegDraft[] = []
    let updatedTreasurySourceWallet: Wallet
    let updatedDestinationWallet: Wallet
    let updatedTreasuryDestinationWallet: Wallet

    if (isSameCurrency) {
      // Principal moves wallet-to-wallet directly; only the fee routes
      // through treasury (see LedgerService design notes on same-currency).
      legs.push(
        { walletId: sourceWallet.getId(), direction: EntryDirection.debit(), money: amount, description: 'remittance principal debit' },
        { walletId: destinationWallet.getId(), direction: EntryDirection.credit(), money: amount, description: 'remittance principal credit' },
        { walletId: sourceWallet.getId(), direction: EntryDirection.debit(), money: fee, description: 'remittance fee debit' },
        { walletId: treasurySourceWallet.getId(), direction: EntryDirection.credit(), money: fee, description: 'remittance fee revenue' },
      )
      updatedTreasurySourceWallet = treasurySourceWallet.credit(fee)
      updatedDestinationWallet = destinationWallet.credit(amount)
      updatedTreasuryDestinationWallet = updatedTreasurySourceWallet
    } else {
      legs.push(
        { walletId: sourceWallet.getId(), direction: EntryDirection.debit(), money: amount, description: 'remittance principal debit' },
        { walletId: treasurySourceWallet.getId(), direction: EntryDirection.credit(), money: amount, description: 'FX settlement (source leg)' },
        { walletId: sourceWallet.getId(), direction: EntryDirection.debit(), money: fee, description: 'remittance fee debit' },
        { walletId: treasurySourceWallet.getId(), direction: EntryDirection.credit(), money: fee, description: 'remittance fee revenue' },
        { walletId: treasuryDestinationWallet.getId(), direction: EntryDirection.debit(), money: convertedAmount, description: 'FX settlement (destination leg)' },
        { walletId: destinationWallet.getId(), direction: EntryDirection.credit(), money: convertedAmount, description: 'remittance principal credit' },
      )
      updatedTreasurySourceWallet = treasurySourceWallet.credit(amount).credit(fee)
      updatedTreasuryDestinationWallet = treasuryDestinationWallet.debit(convertedAmount)
      updatedDestinationWallet = destinationWallet.credit(convertedAmount)
    }

    await this.ledgerService.postBalancedEntries(legs, transactionId)

    await this.walletRepository.save(updatedSourceWallet)
    await this.walletRepository.save(updatedDestinationWallet)
    await this.walletRepository.save(updatedTreasurySourceWallet)
    if (!isSameCurrency) {
      await this.walletRepository.save(updatedTreasuryDestinationWallet)
    }

    const remittance = new Remittance(
      remittanceId,
      senderAccountId,
      recipientAccountId,
      sourceWallet.getId(),
      destinationWallet.getId(),
      amount,
      fee,
      convertedAmount,
      exchangeRateValue,
      RemittanceStatus.completed(),
      this.clock.now()
    )

    await this.remittanceRepository.save(remittance)
    return SendRemittanceOutput.from(remittance)
  }

  private async getTreasuryWallet(currency: Currency): Promise<Wallet> {
    const wallet = await this.walletRepository.findByAccountIdAndCurrency(TREASURY_ACCOUNT_ID, currency)
    if (!wallet) {
      throw new WalletNotFoundError(`treasury (${currency.getCode()})`)
    }
    return wallet
  }

}
