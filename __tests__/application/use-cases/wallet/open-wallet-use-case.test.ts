import { OpenWalletUseCase } from '../../../../src/application/wallet/uses-cases/open-wallet-use-case'
import { OpenWalletInput } from '../../../../src/application/wallet/dto/open-wallet-input'
import { InMemoryWalletRepository } from '../../../../src/infra/persistence/in-memory/in-memory-wallet-repository'
import { SystemClock } from '../../../../src/infra/time/system-clock'
import { AccountId } from '../../../../src/domain/account/value-objects/account-id-value-object'
import { WalletAlreadyExistsError } from '../../../../src/domain/shared/errors'

describe('OpenWalletUseCase', () => {
  it('should open a wallet with the given initial balance', async () => {
    const useCase = new OpenWalletUseCase(new InMemoryWalletRepository(), new SystemClock())
    const accountId = AccountId.generate().getValue()

    const output = await useCase.execute(OpenWalletInput.from({
      accountId,
      currency: 'USD',
      initialBalanceMinorUnits: 5000,
    }))

    expect(output.accountId).toEqual(accountId)
    expect(output.currency).toEqual('USD')
    expect(output.balanceMinorUnits).toEqual(5000)
    expect(output.status).toEqual('ACTIVE')
  })

  it('should default the initial balance to zero', async () => {
    const useCase = new OpenWalletUseCase(new InMemoryWalletRepository(), new SystemClock())

    const output = await useCase.execute(OpenWalletInput.from({
      accountId: AccountId.generate().getValue(),
      currency: 'EUR',
    }))

    expect(output.balanceMinorUnits).toEqual(0)
  })

  it('should reject opening a second wallet in the same currency for the same account', async () => {
    const repository = new InMemoryWalletRepository()
    const useCase = new OpenWalletUseCase(repository, new SystemClock())
    const accountId = AccountId.generate().getValue()

    await useCase.execute(OpenWalletInput.from({ accountId, currency: 'USD' }))

    await expect(
      useCase.execute(OpenWalletInput.from({ accountId, currency: 'USD' }))
    ).rejects.toThrow(WalletAlreadyExistsError)
  })
})
