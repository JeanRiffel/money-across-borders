import { z } from 'zod';
import { parseOrThrow } from '../../shared/validation/parse-or-throw';

// Shape only — password strength isn't a policy this codebase enforces
// anywhere today, so this schema doesn't invent one (min(1) just rejects
// missing/empty). See docs/adr/0009-request-validation-with-zod.md.
const createAccountInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class CreateAccountInput {
  constructor(
    public readonly email: string,
    public readonly password: string
  ) {}

  static from(account: unknown): CreateAccountInput {
    const parsed = parseOrThrow(createAccountInputSchema, account);
    return new CreateAccountInput(parsed.email, parsed.password);
  }
}
