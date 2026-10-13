import { Request } from 'express'

// The real logger spins up pino transport worker threads (and ships to Loki
// when LOKI_URL is set) — replaced so this stays a pure unit test.
jest.mock('../../../../src/infra/observability/logger', () => ({
  logger: { error: jest.fn() },
}))

import { logger } from '../../../../src/infra/observability/logger'
import {
  INTERNAL_ERROR_MESSAGE,
  internalErrorResponse,
} from '../../../../src/interfaces/http/controllers/internal-error'
import { CreateAccountController } from '../../../../src/interfaces/http/controllers/create-account.controller'

describe('internalErrorResponse', () => {
  beforeEach(() => (logger.error as jest.Mock).mockClear())

  it('returns a generic 500 and logs the real error', () => {
    const error = new Error('The client is closed')

    const response = internalErrorResponse('CreateAccountUseCase', error)

    expect(response).toEqual({ statusCode: 500, result: INTERNAL_ERROR_MESSAGE })
    expect(logger.error).toHaveBeenCalledWith(
      { err: error, useCase: 'CreateAccountUseCase' },
      expect.stringContaining('CreateAccountUseCase')
    )
  })

  // Regression for the signup incident: the raw node-redis message used to be
  // the response body, forwarded verbatim by the web BFF to the signup form.
  it('keeps infrastructure error details out of a controller response', async () => {
    const controller = new CreateAccountController({
      execute: () => Promise.reject(new Error('The client is closed')),
    })
    const req = {
      body: { email: 'someone@example.com', password: '12345678' },
      header: () => undefined,
    } as unknown as Request

    const response = await controller.handle(req)

    expect(response).toEqual({ statusCode: 500, result: INTERNAL_ERROR_MESSAGE })
    expect(JSON.stringify(response)).not.toContain('client is closed')
  })
})
