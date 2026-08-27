export class CreateAccountInput {
  constructor(
    public readonly email: string,
    public readonly password: string
  ) {}

  static from(account: any): CreateAccountInput {
    return new CreateAccountInput(account.email, account.password);
  }
}
