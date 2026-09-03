import { z } from 'zod';
import { parseOrThrow } from '../../shared/validation/parse-or-throw';

const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class LoginInput {
  constructor(
    public readonly email: string,
    public readonly password: string
  ) {}

  static from(raw: unknown): LoginInput {
    const parsed = parseOrThrow(loginInputSchema, raw);
    return new LoginInput(parsed.email, parsed.password);
  }
}
