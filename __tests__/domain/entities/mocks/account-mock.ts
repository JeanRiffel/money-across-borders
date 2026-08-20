import { AccountStatus } from "../../../../src/domain/account/value-objects/account-status-value-object";

export const inputData = {
  id: 1,
  status: 1,
  createdAt: new Date()
}

export const accountStatus = new AccountStatus(1);


export const expectedOutput = (accountId: any, userId: any) => {
  return {
    id: accountId,
    userId: userId,
    status: new AccountStatus(inputData.status),
    createdAt: inputData.createdAt,
  }

};
