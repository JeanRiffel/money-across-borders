import { Account } from "../../../domain/account/entities/account";
import { User } from "../../../domain/user/entities/user";

export class CreateAccountOutput {
  constructor(
    public readonly accountId: string,
    public readonly email: string,
    public readonly status: string,
    public readonly createdAt: string
  ) {}


  // Takes both aggregates the use case provisions: email lives on User now,
  // everything else comes from the Account it opened for that User.
  static from(account: Account, user: User): CreateAccountOutput {
    return new CreateAccountOutput(
      account.getId().getValue(),
      user.getEmail(),
      account.getStatus().getDescription(),
      account.getCreatedAt().toISOString()
    )
  }
}
