import { Request } from "express"
import { UseCase } from "src/application/shared/idempotency/common-use-case."
import { LoginInput } from "src/application/user/dto/login-input"
import { LoginOutput } from "src/application/user/dto/login-output"
import { InvalidCredentialsError } from "src/domain/shared/errors"

export class LoginController {

  constructor(
    private readonly loginUseCase: UseCase<LoginInput, LoginOutput>
  ) {}

  async handle(req: Request): Promise<any> {
    try {
      const input = LoginInput.from(req.body)
      const result = await this.loginUseCase.execute(input)

      return { statusCode: 200, result }
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return { statusCode: 401, result: error.message }
      }
      return { statusCode: 500, result: `Error on LoginUseCase: ${error}` }
    }
  }

}
