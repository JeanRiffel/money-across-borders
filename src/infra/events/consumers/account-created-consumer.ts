import { connectRabbitMQ } from "../../config/message-broker/rabbitmq-connection"
import { logger } from "../../observability/logger"

const QUEUE = 'account.created'

type AccountCreatedEvent = {
  accountId: string
  userId: string
  email: string
  createdAt: string
}

// Runs as a separate process from the HTTP server (see the worker:* npm
// script) — the same "consumer is its own long-running process, not part of
// buildApp()" shape the old (broken, pre-pivot) transaction.worker.ts/
// rabbitmq-consumer.ts pair had, just against the current account domain
// and actually wired to real, existing modules this time.
export const consumeAccountCreatedEvents = async (): Promise<void> => {
  const { channel } = await connectRabbitMQ()
  await channel.assertQueue(QUEUE, { durable: true })

  logger.info(`Waiting for messages in ${QUEUE}...`)

  channel.consume(QUEUE, (message) => {
    if (!message) return

    const event = JSON.parse(message.content.toString()) as AccountCreatedEvent

    // Simulated: no real email provider is called here, deliberately — same
    // mocked-external-integration spirit as MockExchangeRateProvider and
    // InMemoryComplianceChecker elsewhere in this codebase.
    logger.info(
      { accountId: event.accountId, email: event.email },
      `📧 Simulated: confirmation email sent to ${event.email}`
    )

    channel.ack(message)
  })
}

// Guarded like server.ts's startServer(): only runs when this file is the
// actual entrypoint, so importing it elsewhere (e.g. a future test) doesn't
// also start consuming as a side effect of the import.
if (require.main === module) {
  consumeAccountCreatedEvents().catch((error) => {
    logger.error({ error }, 'Failed to start account.created consumer')
    process.exit(1)
  })
}
