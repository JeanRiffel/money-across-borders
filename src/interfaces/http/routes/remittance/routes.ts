import { Router, Request, Response } from 'express';
import { SendRemittanceController } from '../../controllers/send-remittance.controller';
import { SearchRemittancesController } from '../../controllers/search-remittances.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication';

const remittanceRouter = (
  sendController: SendRemittanceController,
  searchController: SearchRemittancesController,
  tokenVerifier: TokenVerifier
): Router => {
  const router = Router();

  /**
   * @openapi
   * /remittances:
   *   post:
   *     summary: Send a remittance from one account's wallet to another's
   *     description: >
   *       Converts money from the sender's wallet currency to the
   *       recipient's via a mocked FX rate, posting through system-owned
   *       per-currency treasury wallets.
   *     tags: [Remittance]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/IdempotencyKeyHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/SendRemittanceInput'
   *     responses:
   *       201:
   *         description: Remittance sent.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode: { type: integer, example: 201 }
   *                 result: { $ref: '#/components/schemas/SendRemittanceOutput' }
   *       400:
   *         description: Request body failed validation.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       401:
   *         description: Missing or invalid bearer token.
   *       403:
   *         description: Rejected by the compliance/KYC check.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       404:
   *         description: Sender or recipient wallet not found.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       409:
   *         description: The Idempotency-Key is already in flight.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       422:
   *         description: Insufficient funds, unsupported currency, or no exchange rate available.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       500:
   *         description: Unexpected error.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   */
  router.post(
    '/remittances',
    authMiddleware(tokenVerifier),
    async (req: Request, res: Response) => {
      try {
        const result = await sendController.handle(req);
        res.status(result.statusCode).json(result);
      } catch (error) {
        res.status(500).json(error);
      }
    }
  );

  // Read side (Elasticsearch, eventually consistent) — see
  // search-remittances.controller.ts and CLAUDE.md's EventPublisher note.
  /**
   * @openapi
   * /remittances:
   *   get:
   *     summary: Search remittances for an account
   *     description: >
   *       Reads from the Elasticsearch-backed CQRS read side, which is
   *       eventually consistent with the write side above.
   *     tags: [Remittance]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: accountId
   *         in: query
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: >
   *           Required — without it this would return every account's
   *           remittances, and there's no per-resource authorization layer
   *           yet to otherwise stop that.
   *       - name: status
   *         in: query
   *         required: false
   *         schema: { type: string }
   *       - name: from
   *         in: query
   *         required: false
   *         schema: { type: string, format: date-time }
   *       - name: to
   *         in: query
   *         required: false
   *         schema: { type: string, format: date-time }
   *       - name: limit
   *         in: query
   *         required: false
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Matching remittances.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode: { type: integer, example: 200 }
   *                 result: { $ref: '#/components/schemas/SearchRemittancesOutput' }
   *       400:
   *         description: >
   *           accountId query parameter is missing or invalid, or another
   *           query parameter (e.g. limit) failed validation.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       401:
   *         description: Missing or invalid bearer token.
   *       500:
   *         description: Unexpected error.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   */
  router.get('/remittances', authMiddleware(tokenVerifier), async (req: Request, res: Response) => {
    try {
      const result = await searchController.handle(req);
      res.status(result.statusCode).json(result);
    } catch (error) {
      res.status(500).json(error);
    }
  });

  return router;
};

export { remittanceRouter };
