import { Router, Request, Response } from 'express'
import { CreateAccountController } from '../../controllers/create-account.controller'

// Deliberately NOT behind authMiddleware: this is the signup endpoint, and
// there is no token-issuance/login endpoint anywhere in the codebase yet — a
// new user has no way to obtain a bearer token before this call succeeds.
// Gating account creation on auth would make it unreachable. Wallet and
// remittance routes (post-signup actions) keep authMiddleware.
const accountRouter = (
  controller: CreateAccountController
): Router => {

  const router = Router()

  router.post('/account', async(req: Request, res: Response) => {
    try {
      const result = await controller.handle(req)
      res.status(result.statusCode).json(result)
    }catch(error){
      res.status(500).json(error)
    }
  })

  return router
}

export { accountRouter }
