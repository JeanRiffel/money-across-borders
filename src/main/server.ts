import express, { Request, Response } from "express"
import dotenv from 'dotenv'
import { MongoDatabaseSingleton } from "../infra/config/database/mongo-database-sigleton"
import { accountRouter } from "../interfaces/http/routes/account/routes"
import { walletRouter } from "../interfaces/http/routes/wallet/routes"
import { remittanceRouter } from "../interfaces/http/routes/remittance/routes"
import { CreateAccountController } from "../interfaces/http/controllers/create-account.controller"
import { OpenWalletController } from "../interfaces/http/controllers/open-wallet.controller"
import { SendRemittanceController } from "../interfaces/http/controllers/send-remittance.controller"
import { createAccountUseCase } from "src/infra/factories/account-factory"
import { createOpenWalletUseCase } from "src/infra/factories/wallet-factory"
import { createSendRemittanceUseCase } from "src/infra/factories/remittance-factory"
import { createJWTService } from "../infra/factories/jwt-factory"
dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Initialize database and start server
const startServer = async () => {
  // None of this slice's routes (account/wallet/remittance) touch Mongo —
  // everything is wired to the in-memory registry — so a missing/unreachable
  // Mongo instance is logged, not fatal. Previously this was an unconditional
  // await that called process.exit(1) on failure, which meant the server
  // could never start at all without a real Mongo running.
  try {
    await MongoDatabaseSingleton.getInstance()
    console.log('✓ Database connection established')
  } catch (error) {
    console.warn('⚠ MongoDB unavailable, continuing without it (not used by this slice):', error)
  }

  const jwtService = createJWTService()

  const accountModule = createAccountUseCase()
  app.use(accountRouter(new CreateAccountController(accountModule)))

  const walletModule = createOpenWalletUseCase()
  app.use(walletRouter(new OpenWalletController(walletModule), jwtService))

  const remittanceModule = await createSendRemittanceUseCase()
  app.use(remittanceRouter(new SendRemittanceController(remittanceModule), jwtService))

  app.listen(port, () => {
    console.log(`✓ Server is running on port ${port}`)
  })
}

startServer()
