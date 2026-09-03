import { Router, Request, Response } from 'express';
import { CreateAccountController } from '../../controllers/create-account.controller';

// Deliberately NOT behind authMiddleware: this is the signup endpoint, and
// there is no token-issuance/login endpoint anywhere in the codebase yet — a
// new user has no way to obtain a bearer token before this call succeeds.
// Gating account creation on auth would make it unreachable. Wallet and
// remittance routes (post-signup actions) keep authMiddleware.
const accountRouter = (controller: CreateAccountController): Router => {
  const router = Router();

  /**
   * @openapi
   * /account:
   *   post:
   *     summary: Create an account (signup)
   *     description: >
   *       Provisions a User (credentials) and an Account (financial/ledger
   *       relationship) together. Not behind authMiddleware — there's no way
   *       to have a token before signing up.
   *     tags: [Account]
   *     parameters:
   *       - $ref: '#/components/parameters/IdempotencyKeyHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateAccountInput'
   *     responses:
   *       201:
   *         description: Account created.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode: { type: integer, example: 201 }
   *                 result: { $ref: '#/components/schemas/CreateAccountOutput' }
   *       400:
   *         description: Request body failed validation.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       409:
   *         description: An account with this email already exists.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       500:
   *         description: Unexpected error.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   */
  router.post('/account', async (req: Request, res: Response) => {
    try {
      const result = await controller.handle(req);
      res.status(result.statusCode).json(result);
    } catch (error) {
      res.status(500).json(error);
    }
  });

  return router;
};

export { accountRouter };
