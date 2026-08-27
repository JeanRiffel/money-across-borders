import { Kafka, Producer, Consumer } from 'kafkajs';
import dotenv from 'dotenv';
import { logger } from '../../observability/logger';

// Self-contained on purpose, same rationale as pg.ts/redisClient.ts/
// rabbitmq-connection.ts: this module can't assume its entrypoint already
// called dotenv.config() before importing it (a standalone worker process
// is exactly the case that bit rabbitmq-connection.ts before it got this
// same line — see CLAUDE.md). dotenv.config() is safe to call more than
// once.
dotenv.config();

function buildBrokers(): string[] {
  return (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((broker) => broker.trim());
}

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'money-across-borders',
  brokers: buildBrokers(),
});

let producerPromise: Promise<Producer> | null = null;

// Memoized/lazy, like connectRedis()/connectRabbitMQ() — nothing connects
// at import time. A failed attempt clears the memoized promise so the next
// publish() retries instead of replaying the same rejection forever.
export async function getKafkaProducer(): Promise<Producer> {
  if (!producerPromise) {
    producerPromise = (async () => {
      const producer = kafka.producer();
      await producer.connect();
      logger.info('✅ Connected to Kafka (producer)');
      return producer;
    })().catch((error) => {
      producerPromise = null;
      throw error;
    });
  }
  return producerPromise;
}

// Each consumer needs its own connect()/subscribe()/run() lifecycle (see
// remittance-completed-indexer.ts), so this just hands back an unconnected
// Consumer scoped to the given consumer group rather than trying to
// memoize/share one the way the producer above does.
export function createKafkaConsumer(groupId: string): Consumer {
  return kafka.consumer({ groupId });
}
