import { AddressInfo } from 'net'
import { Server } from 'http'
import { BeforeAll, AfterAll, Before } from '@cucumber/cucumber'
import { buildApp } from 'src/main/server'
import { pool } from 'src/infra/config/database/postgresql/pg'
import { CustomWorld } from './world'

// Built once for the whole suite (not per-scenario): wiring the app talks
// to real Postgres, so rebuilding it per scenario would just add latency
// for no isolation benefit — scenarios don't share in-process state, only
// the same database connection pool. Bound to an ephemeral port (0) so the
// suite never collides with a `npm run dev`/`npm start` already running on
// PORT from .env.
let server: Server
let baseUrl: string

BeforeAll(async function () {
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

AfterAll(async function () {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await pool.end()
})
