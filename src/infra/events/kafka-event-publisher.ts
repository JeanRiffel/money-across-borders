import { EventPublisher } from "../../application/shared/events/event-publisher"
import { getKafkaProducer } from "../config/message-broker/kafka-connection"
import { logger } from "../observability/logger"

// Kafka counterpart to RabbitMQEventPublisher — same EventPublisher port,
// different broker underneath, chosen per event by whichever factory wires
// it in (see remittance-factory.ts vs account-factory.ts). SendRemittanceUseCase
// takes this one: remittance.completed is a stream of business facts a
// consumer group can replay/re-read (today: the Elasticsearch indexer;
// plausibly others later — analytics, audit), not a one-shot task queue
// item the way account.created is. See CLAUDE.md's EventPublisher note for
// the full RabbitMQ-vs-Kafka reasoning.
export class KafkaEventPublisher implements EventPublisher {

  // Never throws (same contract as RabbitMQEventPublisher): a failed
  // connect/send is caught and logged here, not surfaced to the caller —
  // losing an occasional remittance.completed event means that remittance
  // doesn't show up in search until reindexed some other way, not that the
  // remittance itself fails.
  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const producer = await getKafkaProducer()
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      })
    } catch (error) {
      logger.warn({ error, topic }, 'Failed to publish event to Kafka')
    }
  }

}
