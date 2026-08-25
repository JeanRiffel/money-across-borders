// Must be the first import in the process — see tracing.ts for why.
import "../infra/observability/tracing"
import express, { Express, Request, Response } from "express"
import pinoHttp from "pino-http"
import dotenv from 'dotenv'
import { logger } from "../infra/observability/logger"
import { httpMetricsMiddleware, register } from "../infra/observability/metrics"
import { MongoDatabaseSingleton } from "../infra/config/database/mongo-database-sigleton"
import { accountRouter } from "../interfaces/http/routes/account/routes"
import { walletRouter } from "../interfaces/http/routes/wallet/routes"
import { remittanceRouter } from "../interfaces/http/routes/remittance/routes"
import { userRouter } from "../interfaces/http/routes/user/routes"
import { CreateAccountController } from "../interfaces/http/controllers/create-account.controller"
import { OpenWalletController } from "../interfaces/http/controllers/open-wallet.controller"
import { SendRemittanceController } from "../interfaces/http/controllers/send-remittance.controller"
import { LoginController } from "../interfaces/http/controllers/login.controller"
import { createAccountUseCase } from "src/infra/factories/account-factory"
import { createOpenWalletUseCase } from "src/infra/factories/wallet-factory"
import { createSendRemittanceUseCase } from "src/infra/factories/remittance-factory"
import { createLoginUseCase } from "src/infra/factories/user-factory"
import { createJWTService } from "../infra/factories/jwt-factory"
import { pool } from "../infra/config/database/postgresql/pg"
import { connectRedis, redisClient } from "../infra/config/database/redis/redisClient"
dotenv.config()

// Wires the Express app (Mongo check, Postgres check, all routers) without
// calling app.listen(). Split out from startServer() so integration tests
// (see features/support/) can build the exact same app in-process, bind it
// to an ephemeral port themselves, and tear it down per scenario — instead
// of duplicating this wiring or requiring a server already running on a
// fixed port. startServer() below is the only caller for the CLI/prod path.
export const buildApp = async (): Promise<Express> => {
  const app = express()
  app.use(express.json())
  app.use(pinoHttp({ logger }))
  app.use(httpMetricsMiddleware)

  app.get('/health', (_req: Request, res: Response) => {
    return res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Unauthenticated, like /health above — the Prometheus scraper has no JWT.
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', register.contentType)
    return res.send(await register.metrics())
  })

  // None of this slice's routes (account/wallet/remittance) touch Mongo —
  // everything is wired to the in-memory registry — so a missing/unreachable
  // Mongo instance is logged, not fatal.
  try {
    await MongoDatabaseSingleton.getInstance()
    logger.info('✓ Database connection established')
  } catch (error) {
    logger.warn({ error }, '⚠ MongoDB unavailable, continuing without it (not used by this slice)')
  }

  // Unlike Mongo above, Postgres IS the source of truth for the
  // account/wallet/remittance flow now (see infra/persistence/postgresql) —
  // a failed connection here is fatal. Run `npm run db:migrate` first
  // against a fresh database (see CLAUDE.md). Thrown rather than
  // process.exit(1)'d here so callers (startServer, integration tests)
  // decide how to react to an unreachable database.
  try {
    await pool.query('SELECT 1')
    logger.info('✓ Postgres connection established')
  } catch (error) {
    throw new Error(`Postgres unavailable, cannot start: ${error}`)
  }

  // Idempotency for account/wallet/remittance now lives in Redis (see
  // redis-registry.ts and the *-factory.ts files) — IdempotentDecorator's
  // claim() is the real concurrency gate for those use cases, so an
  // unreachable Redis is fatal here for the same reason an unreachable
  // Postgres is above, not degraded-non-fatal like Mongo below.
  try {
    await connectRedis()
    logger.info('✓ Redis connection established')
  } catch (error) {
    throw new Error(`Redis unavailable, cannot start: ${error}`)
  }

  const jwtService = createJWTService()

  const accountModule = createAccountUseCase()
  app.use(accountRouter(new CreateAccountController(accountModule)))

  const loginModule = createLoginUseCase(jwtService)
  app.use(userRouter(new LoginController(loginModule)))

  const walletModule = createOpenWalletUseCase()
  app.use(walletRouter(new OpenWalletController(walletModule), jwtService))

  const remittanceModule = await createSendRemittanceUseCase()
  app.use(remittanceRouter(new SendRemittanceController(remittanceModule), jwtService))

  return app
}

const port = process.env.PORT || 3000

// Initialize database and start server
const startServer = async () => {
  let app: Express
  try {
    app = await buildApp()
  } catch (error) {
    logger.error(`✗ ${error}`)
    process.exit(1)
  }

  app.listen(port, () => {
    logger.info(`✓ Server is running on port ${port}`)
  })
}

// First shutdown hooks in this codebase — nothing closed the Postgres pool
// on exit before now (it also didn't need to, being unused). Mongo's client
// is left as-is here: still non-fatal/unused by this slice, out of scope.
// Redis is closed alongside Postgres now that it's load-bearing too (see
// the connectRedis() call above).
const shutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received, closing Postgres pool and Redis connection...`)
  await pool.end()
  if (redisClient.isOpen) {
    await redisClient.quit()
  }
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

// Guarded so importing buildApp (e.g. from the Cucumber integration suite,
// see features/support/) doesn't also boot a second server on the fixed
// PORT and register a second pair of shutdown handlers as a side effect of
// the import — startServer() now only runs when this file is the actual
// entrypoint (`ts-node src/main/server.ts` / `bun run src/main/server.ts`).
if (require.main === module) {
  startServer()
}
