import { AddressInfo } from 'net'
import { Server } from 'http'
import { BeforeAll, AfterAll, Before } from '@cucumber/cucumber'
import { buildApp } from 'src/main/server'
import { pool } from 'src/infra/config/database/postgresql/pg'
import { redisClient } from 'src/infra/config/database/redis/redisClient'
import { MongoDatabaseSingleton } from 'src/infra/config/database/mongo-database-sigleton'
import { elasticsearchClient } from 'src/infra/config/database/elasticsearch/elasticsearch-client'
import { shutdownTracing } from 'src/infra/observability/tracing'
import { CustomWorld } from './world'

// Built once for the whole suite (not per-scenario): wiring the app talks
// to real Postgres, so rebuilding it per scenario would just add latency
// for no isolation benefit — scenarios don't share in-process state, only
// the same database connection pool. Bound to an ephemeral port (0) so the
// suite never collides with a `npm run dev`/`npm start` already running on
// PORT from .env.
let server: Server
let baseUrl: string

// buildApp() waits for Mongo and Elasticsearch before degrading without them
// (Mongo's driver alone takes 30s to give up), and CI runs neither — so the
// default 5s hook timeout failed the suite before a single scenario ran.
const HOOK_TIMEOUT_MS = 90_000

BeforeAll({ timeout: HOOK_TIMEOUT_MS }, async function () {
  const app = await buildApp()
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as AddressInfo
  baseUrl = `http://localhost:${port}`
})

Before(function (this: CustomWorld) {
  this.baseUrl = baseUrl
})

// Closes everything buildApp() opened, mirroring server.ts's shutdown steps.
// Any handle left open keeps cucumber-js running after the last scenario,
// which hung CI until GitHub cancelled the job at 6 hours. `server` is
// guarded because a failed BeforeAll never assigns it.
AfterAll({ timeout: HOOK_TIMEOUT_MS }, async function () {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeIdleConnections()
    })
  }
  await pool.end()
  if (redisClient.isOpen) await redisClient.quit()
  await MongoDatabaseSingleton.disconnect()
  await elasticsearchClient.close()
  // Tracing is a side channel (see tracing.ts): shutdown flushes pending
  // spans, and an unreachable collector must not fail a suite whose
  // scenarios passed.
  await shutdownTracing().catch((error) =>
    console.warn('⚠ OpenTelemetry tracing shutdown failed:', error.message)
  )
})
