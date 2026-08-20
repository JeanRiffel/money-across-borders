import { Account } from '../../../src/domain/account/entities/account';
import { AccountId } from '../../../src/domain/account/value-objects/account-id-value-object';
import { AccountStatus } from '../../../src/domain/account/value-objects/account-status-value-object';
import { UserId } from '../../../src/domain/user/value-objects/user-id-value-object';
import { expectedOutput, inputData } from './mocks/account-mock';

describe('Account', () => {

  it('should create an Account owned by a User', () => {
    const accountId = AccountId.generate();
    const userId = UserId.generate();

    const account = new Account(
      accountId,
      userId,
      new AccountStatus(inputData.status),
      inputData.createdAt
    );

    const output = expectedOutput(accountId, userId)
    expect(account).toEqual(output);
  });

  // Not every Account has a human owner — e.g. the system treasury account
  // (see domain/wallet/treasury-account.ts) is an Account with no User.
  it('should create a system Account with no owning User', () => {
    const accountId = AccountId.generate();

    const account = new Account(
      accountId,
      null,
      new AccountStatus(inputData.status),
      inputData.createdAt
    );

    expect(account.getUserId()).toBeNull();
  });

});
