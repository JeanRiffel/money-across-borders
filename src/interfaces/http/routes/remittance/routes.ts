import { Router, Request, Response } from 'express'
import { SendRemittanceController } from '../../controllers/send-remittance.controller'
import { SearchRemittancesController } from '../../controllers/search-remittances.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication'

const remittanceRouter = (
  sendController: SendRemittanceController,
  searchController: SearchRemittancesController,
  tokenVerifier: TokenVerifier
): Router => {

  const router = Router()

  router.post('/remittances', authMiddleware(tokenVerifier), async (req: Request, res: Response) => {
    try {
      const result = await sendController.handle(req)
      res.status(result.statusCode).json(result)
    } catch (error) {
      res.status(500).json(error)
    }
  })

  // Read side (Elasticsearch, eventually consistent) — see
  // search-remittances.controller.ts and CLAUDE.md's EventPublisher note.
  router.get('/remittances', authMiddleware(tokenVerifier), async (req: Request, res: Response) => {
    try {
      const result = await searchController.handle(req)
      res.status(result.statusCode).json(result)
    } catch (error) {
      res.status(500).json(error)
    }
  })

  return router
}

export { remittanceRouter }
