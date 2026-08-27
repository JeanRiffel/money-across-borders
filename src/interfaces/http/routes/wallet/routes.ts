import { Router, Request, Response } from 'express';
import { OpenWalletController } from '../../controllers/open-wallet.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication';

const walletRouter = (controller: OpenWalletController, tokenVerifier: TokenVerifier): Router => {
  const router = Router();

  /**
   * @openapi
   * /wallets:
   *   post:
   *     summary: Open a currency-denominated wallet for an account
   *     tags: [Wallet]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/IdempotencyKeyHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/OpenWalletInput'
   *     responses:
   *       201:
   *         description: Wallet opened.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode: { type: integer, example: 201 }
   *                 result: { $ref: '#/components/schemas/OpenWalletOutput' }
   *       401:
   *         description: Missing or invalid bearer token.
   *       409:
   *         description: This account already has a wallet in this currency, or the Idempotency-Key is already in flight.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       422:
   *         description: Unsupported currency.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       500:
   *         description: Unexpected error.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   */
  router.post('/wallets', authMiddleware(tokenVerifier), async (req: Request, res: Response) => {
    try {
      const result = await controller.handle(req);
      res.status(result.statusCode).json(result);
    } catch (error) {
      res.status(500).json(error);
    }
  });

  return router;
};

export { walletRouter };
