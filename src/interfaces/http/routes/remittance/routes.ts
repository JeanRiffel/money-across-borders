import { Router, Request, Response } from 'express'
import { SendRemittanceController } from '../../controllers/send-remittance.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication'

const remittanceRouter = (
  controller: SendRemittanceController,
  tokenVerifier: TokenVerifier
): Router => {

  const router = Router()

  router.post('/remittances', authMiddleware(tokenVerifier), async (req: Request, res: Response) => {
    try {
      const result = await controller.handle(req)
      res.status(result.statusCode).json(result)
    } catch (error) {
      res.status(500).json(error)
    }
  })

  return router
}

export { remittanceRouter }
