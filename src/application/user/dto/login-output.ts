import { User } from "../../../domain/user/entities/user"
import { Account } from "../../../domain/account/entities/account"

export class LoginOutput {
  constructor(
    public readonly token: string,
    public readonly userId: string,
    public readonly accountId: string,
    public readonly email: string,
  ) {}

  static from(token: string, user: User, account: Account): LoginOutput {
    return new LoginOutput(
      token,
      user.getId().getValue(),
      account.getId().getValue(),
      user.getEmail(),
    )
  }
}
