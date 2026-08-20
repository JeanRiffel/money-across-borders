import { UserStatus } from "../../../../src/domain/user/value-objects/user-status-value-object";

export const inputData = {
  email: 'jane@test.com',
  passwordHash: 'hashed-password',
  status: 1,
  createdAt: new Date()
}

export const userStatus = new UserStatus(1);

export const expectedOutput = (userId: any) => {
  return {
    id: userId,
    email: inputData.email,
    passwordHash: inputData.passwordHash,
    status: new UserStatus(inputData.status),
    createdAt: inputData.createdAt,
  }

};
