export class LoginInput {
  constructor(
    public readonly email: string,
    public readonly password: string
  ) {}

  static from(raw: any): LoginInput {
    return new LoginInput(raw.email, raw.password);
  }
}
