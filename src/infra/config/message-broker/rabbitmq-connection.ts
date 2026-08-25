import amqp from 'amqplib';
import dotenv from 'dotenv';
import { logger } from '../../observability/logger';

// Self-contained on purpose, matching pg.ts's exact rationale: this module
// must not assume its entrypoint already called dotenv.config() before
// importing it. server.ts does (eventually — see its own dotenv.config()
// call), but account-created-consumer.ts (the worker: npm script) is a
// separate process with no other module in its chain calling it, so without
// this line RABBITMQ_HOST/PORT/USER/PASSWORD would silently read as
// undefined there and buildConnectionUrl() below would fall back to
// localhost:5672 guest:guest — connecting to the wrong broker, or failing
// auth against a broker (like this project's) that isn't guest:guest.
// dotenv.config() is safe to call more than once (later calls don't
// override already-set vars).
dotenv.config();

// RABBITMQ_HOST/PORT/USER/PASSWORD, matching the HOST/PORT/USER/PASSWORD
// convention every other service in .env(.example) already uses
// (POSTGRES_*, MONGO_*) — the previous version of this file hardcoded
// amqp://user:pass@localhost:5672 directly in source, ignoring .env
// entirely (and not even matching .env.example's guest:guest).
function buildConnectionUrl(): string {
  const host = process.env.RABBITMQ_HOST || 'localhost'
  const port = process.env.RABBITMQ_PORT || '5672'
  const user = process.env.RABBITMQ_USER || 'guest'
  const password = process.env.RABBITMQ_PASSWORD || 'guest'
  return `amqp://${user}:${password}@${host}:${port}`
}

type RabbitMQConnection = Awaited<ReturnType<typeof amqp.connect>>
type RabbitMQChannel = Awaited<ReturnType<RabbitMQConnection['createChannel']>>

let connectPromise: Promise<{ connection: RabbitMQConnection; channel: RabbitMQChannel }> | null = null

// Memoized/lazy, like connectRedis() — nothing connects at import time
// anymore. Unlike Redis (fatal at boot, see server.ts), RabbitMQ stays
// non-fatal here: the one thing wired to it so far (the account.created
// notification, see RabbitMQEventPublisher) is a best-effort side effect,
// not a correctness guarantee, so an unreachable broker shouldn't block the
// app from starting or block any request. A failed attempt clears the
// memoized promise so the next publish() retries instead of replaying the
// same rejection forever.
export const connectRabbitMQ = async () => {
  if (!connectPromise) {
    connectPromise = (async () => {
      const connection = await amqp.connect(buildConnectionUrl())
      const channel = await connection.createChannel()
      logger.info('✅ Connected to RabbitMQ')
      return { connection, channel }
    })().catch((error) => {
      connectPromise = null
      throw error
    })
  }
  return connectPromise
}
