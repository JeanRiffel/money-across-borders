import { Router, Request, Response } from 'express';
import { SubmitKycController } from '../../controllers/submit-kyc.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { TokenVerifier } from 'src/application/shared/authentication/token-authentication';

const complianceRouter = (
  controller: SubmitKycController,
  tokenVerifier: TokenVerifier
): Router => {
  const router = Router();

  // Closes the gap CLAUDE.md used to document ("no HTTP submit/verify
  // endpoint") — a KycProfile could previously only be marked VERIFIED by
  // saving one directly through KycProfileRepository (tests or an ad-hoc
  // script). Auth-gated like /wallets and /remittances: a submission has to
  // be tied to a logged-in account.
  /**
   * @openapi
   * /kyc:
   *   post:
   *     summary: Submit a KYC profile for compliance review
   *     tags: [Compliance]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - $ref: '#/components/parameters/IdempotencyKeyHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/SubmitKycInput'
   *     responses:
   *       201:
   *         description: KYC profile submitted.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode: { type: integer, example: 201 }
   *                 result: { $ref: '#/components/schemas/SubmitKycOutput' }
   *       401:
   *         description: Missing or invalid bearer token.
   *       409:
   *         description: The Idempotency-Key is already in flight.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   *       500:
   *         description: Unexpected error.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/ErrorResponse' }
   */
  router.post('/kyc', authMiddleware(tokenVerifier), async (req: Request, res: Response) => {
    try {
      const result = await controller.handle(req);
      res.status(result.statusCode).json(result);
    } catch (error) {
      res.status(500).json(error);
    }
  });

  return router;
};

export { complianceRouter };
