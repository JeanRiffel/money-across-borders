import { Router, Request, Response } from 'express'
import { SubmitKycController } from '../../controllers/submit-kyc.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication'

const complianceRouter = (
  controller: SubmitKycController,
  tokenVerifier: TokenVerifier
): Router => {

  const router = Router()

  // Closes the gap CLAUDE.md used to document ("no HTTP submit/verify
  // endpoint") — a KycProfile could previously only be marked VERIFIED by
  // saving one directly through KycProfileRepository (tests or an ad-hoc
  // script). Auth-gated like /wallets and /remittances: a submission has to
  // be tied to a logged-in account.
  router.post('/kyc', authMiddleware(tokenVerifier), async (req: Request, res: Response) => {
    try {
      const result = await controller.handle(req)
      res.status(result.statusCode).json(result)
    } catch (error) {
      res.status(500).json(error)
    }
  })

  return router
}

export { complianceRouter }
