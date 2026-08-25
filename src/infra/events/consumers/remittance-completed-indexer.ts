import { createKafkaConsumer } from "../../config/message-broker/kafka-connection"
import { ElasticsearchRemittanceSearchIndex } from "../../persistence/elasticsearch/elasticsearch-remittance-search-index"
import { RemittanceSearchDocument } from "../../../application/remittance/repositories/remittance-search-index"
import { logger } from "../../observability/logger"

const TOPIC = 'remittance.completed'
const GROUP_ID = 'remittance-completed-indexer'

// Runs as a separate process from the HTTP server (see the worker:* npm
// script), same shape as account-created-consumer.ts — not part of
// buildApp(). Publishing (KafkaEventPublisher) and this consumer are
// independent: nothing about SendRemittanceUseCase depends on this process
// being up, same as account.created and its email worker.
export const consumeRemittanceCompletedEvents = async (): Promise<void> => {
  const searchIndex = new ElasticsearchRemittanceSearchIndex()
  const consumer = createKafkaConsumer(GROUP_ID)
  await consumer.connect()
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false })

  logger.info(`Waiting for messages in ${TOPIC}...`)

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      const event = JSON.parse(message.value.toString()) as RemittanceSearchDocument

      try {
        await searchIndex.index(event)
        logger.info(
          { remittanceId: event.remittanceId },
          `🔎 Indexed remittance ${event.remittanceId} into Elasticsearch`
        )
      } catch (error) {
        // Best-effort read model, same posture as EventPublisher's own
        // contract (see CLAUDE.md): log and move on rather than retry
        // forever or crash the consumer. A missing document just means
        // that one remittance doesn't show up in search until reindexed
        // some other way — it never affects the remittance itself, which
        // already committed to Postgres before this event was even
        // published.
        logger.warn({ error, remittanceId: event.remittanceId }, 'Failed to index remittance.completed event')
      }
    },
  })
}

// Guarded like account-created-consumer.ts / server.ts's startServer(): only
// runs when this file is the actual entrypoint.
if (require.main === module) {
  consumeRemittanceCompletedEvents().catch((error) => {
    logger.error({ error }, 'Failed to start remittance.completed consumer')
    process.exit(1)
  })
}
