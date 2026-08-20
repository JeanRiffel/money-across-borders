import { Router, Request, Response } from 'express'
import { LoginController } from '../../controllers/login.controller'

// Deliberately NOT behind authMiddleware, same reasoning as accountRouter:
// this is the endpoint that hands out the bearer token, so a caller can't
// be expected to already have one to reach it.
const userRouter = (
  controller: LoginController
): Router => {

  const router = Router()

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const result = await controller.handle(req)
      res.status(result.statusCode).json(result)
    } catch (error) {
      res.status(500).json(error)
    }
  })

  return router
}

export { userRouter }
