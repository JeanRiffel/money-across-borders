import { EventPublisher } from "../../application/shared/events/event-publisher"
import { connectRabbitMQ } from "../config/message-broker/rabbitmq-connection"
import { logger } from "../observability/logger"

export class RabbitMQEventPublisher implements EventPublisher {

  // Never throws (see EventPublisher's contract comment): both a failed
  // connection and a failed publish are caught and logged here rather than
  // surfaced to the caller, so a use case awaiting this never has to treat
  // "the broker is down" as a reason to fail whatever it's doing.
  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const { channel } = await connectRabbitMQ()
      // The topic doubles as the queue name — durable so a queued event
      // survives a broker restart before a consumer picks it up; messages
      // are marked persistent below for the same reason.
      await channel.assertQueue(topic, { durable: true })
      channel.sendToQueue(topic, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
        contentType: 'application/json',
      })
    } catch (error) {
      logger.warn({ error, topic }, 'Failed to publish event to RabbitMQ')
    }
  }

}
