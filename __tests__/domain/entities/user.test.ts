import { User } from '../../../src/domain/user/entities/user';
import { UserId } from '../../../src/domain/user/value-objects/user-id-value-object';
import { UserStatus } from '../../../src/domain/user/value-objects/user-status-value-object';
import { expectedOutput, inputData } from './mocks/user-mock';

describe('User', () => {

  it('should create a User', () => {
    const userId = UserId.generate();

    const user = new User(
      userId,
      inputData.email,
      inputData.passwordHash,
      new UserStatus(inputData.status),
      inputData.createdAt
    );

    const output = expectedOutput(userId)
    expect(user).toEqual(output);
  });

});
