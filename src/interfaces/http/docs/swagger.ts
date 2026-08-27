import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Central OpenAPI config for the whole HTTP surface. Code-first (swagger-jsdoc
// scans `@openapi` YAML blocks living next to the route definitions they
// describe — see src/interfaces/http/routes/*/routes.ts) rather than a
// separate, hand-maintained spec file: this repo's route files already carry
// dense inline comments explaining *why* a route is shaped the way it is, so
// keeping the *what* (request/response shape) in the same file avoids a
// second artifact that can silently drift from the actual route.
//
// `components.schemas`/`parameters` below are the shared building blocks
// (mirroring the DTOs under src/application/*/dto/) that each route's
// `@openapi` block $refs — kept here once instead of repeated per route.
const swaggerDefinition: swaggerJsdoc.SwaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Money Across Borders API',
    version: '1.0.0',
    description:
      'Cross-border remittance platform: multi-currency wallets, FX conversion, ' +
      'and money transfer between platform accounts. See AGENTS.md in the repo ' +
      'for the architecture this API sits on top of.',
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT || 3000}`,
      description: 'Local server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Token returned by POST /login. Required by /wallets, /kyc and ' +
          '/remittances — authMiddleware only checks the token is validly ' +
          "signed and unexpired, it does not check the token's accountId " +
          "matches the request's accountId (see AGENTS.md known-issues).",
      },
    },
    parameters: {
      IdempotencyKeyHeader: {
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description:
          'Optional client-supplied key so a retried request replays the ' +
          'cached result instead of executing twice. If omitted, the server ' +
          'generates one per request, which means that request is never ' +
          'deduplicated against a retry.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 409 },
          result: {
            description: 'Human-readable error message.',
            oneOf: [{ type: 'string' }, { type: 'object' }],
          },
        },
      },
      CreateAccountInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
      CreateAccountOutput: {
        type: 'object',
        properties: {
          accountId: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          status: { type: 'string', example: 'ACTIVE' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
      LoginOutput: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          userId: { type: 'string', format: 'uuid' },
          accountId: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
        },
      },
      OpenWalletInput: {
        type: 'object',
        required: ['accountId', 'currency'],
        properties: {
          accountId: { type: 'string', format: 'uuid' },
          currency: { type: 'string', example: 'USD' },
          initialBalanceMinorUnits: {
            type: 'integer',
            default: 0,
            description:
              "Stand-in for 'money already in this wallet' — there's no " +
              'funding/deposit rail in this MVP.',
          },
        },
      },
      OpenWalletOutput: {
        type: 'object',
        properties: {
          walletId: { type: 'string', format: 'uuid' },
          accountId: { type: 'string', format: 'uuid' },
          currency: { type: 'string', example: 'USD' },
          balanceMinorUnits: { type: 'integer' },
          status: { type: 'string', example: 'ACTIVE' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SubmitKycInput: {
        type: 'object',
        required: ['accountId', 'fullName', 'documentId'],
        properties: {
          accountId: { type: 'string', format: 'uuid' },
          fullName: { type: 'string' },
          documentId: { type: 'string' },
          documentType: { type: 'string' },
          attachments: {
            type: 'array',
            items: { type: 'object' },
          },
          notes: { type: 'string' },
        },
      },
      SubmitKycOutput: {
        type: 'object',
        properties: {
          kycProfileId: { type: 'string', format: 'uuid' },
          accountId: { type: 'string', format: 'uuid' },
          status: { type: 'string', example: 'PENDING' },
          verifiedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SendRemittanceInput: {
        type: 'object',
        required: [
          'senderAccountId',
          'recipientAccountId',
          'sourceCurrency',
          'destinationCurrency',
          'amountMinorUnits',
        ],
        properties: {
          senderAccountId: { type: 'string', format: 'uuid' },
          recipientAccountId: { type: 'string', format: 'uuid' },
          sourceCurrency: { type: 'string', example: 'USD' },
          destinationCurrency: { type: 'string', example: 'EUR' },
          amountMinorUnits: { type: 'integer' },
        },
      },
      SendRemittanceOutput: {
        type: 'object',
        properties: {
          remittanceId: { type: 'string', format: 'uuid' },
          status: { type: 'string', example: 'COMPLETED' },
          sourceCurrency: { type: 'string', example: 'USD' },
          destinationCurrency: { type: 'string', example: 'EUR' },
          sourceAmountMinorUnits: { type: 'integer' },
          feeMinorUnits: { type: 'integer' },
          convertedAmountMinorUnits: { type: 'integer' },
          exchangeRate: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SearchRemittancesOutput: {
        type: 'object',
        properties: {
          remittances: {
            type: 'array',
            items: { type: 'object' },
          },
        },
      },
    },
  },
};

const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: ['src/interfaces/http/routes/**/*.ts'],
});

// Mounted unauthenticated at /docs, same as /health and /metrics in
// server.ts — it's API documentation, not a secret.
export function mountSwagger(app: Express): void {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

export { swaggerSpec };
