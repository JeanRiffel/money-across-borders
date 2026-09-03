import { Router, Request, Response } from 'express';
import { LoginController } from '../../controllers/login.controller';

// Deliberately NOT behind authMiddleware, same reasoning as accountRouter:
// this is the endpoint that hands out the bearer token, so a caller can't
// be expected to already have one to reach it.
const userRouter = (controller: LoginController): Router => {
  const router = Router();

  /**
   * @openapi
   * /login:
   *   post:
   *     summary: Log in and obtain a bearer token
   *     description: >
   *       Not behind authMiddleware — this is the endpoint that hands out the
   *       token, so a caller can't be expected to already have one.
   *     tags: [User]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginInput'
   *     responses:
   *       200:
   *         description: Login succeeded.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode: { type: integer, example: 200 }
   *                 result: { $ref: '#/components/schemas/LoginOutput' }
   *       400:
   *         description: Request body failed validation.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       401:
   *         description: Invalid credentials.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       500:
   *         description: Unexpected error.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const result = await controller.handle(req);
      res.status(result.statusCode).json(result);
    } catch (error) {
      res.status(500).json(error);
    }
  });

  return router;
};

export { userRouter };
