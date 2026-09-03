import { Message } from 'amqplib';
import { connectRabbitMQ } from '../../config/message-broker/rabbitmq-connection';
import {
  assertRetryTopology,
  getRetryCount,
  retryTopologyFor,
  RetryTopology,
  RETRY_COUNT_HEADER,
} from '../../config/message-broker/rabbitmq-retry-topology';
import { connectRedis } from '../../config/database/redis/redisClient';
import { redisRegistry } from '../../persistence/redis/redis-registry';
import { IdempotencyRepository } from '../../../application/repositories/idempotency-repository';
import { computeBackoffDelayMs } from '../../resilience/backoff';
import { resilienceConfig } from '../../resilience/resilience-config';
import { rabbitmqDlqMessagesTotal, rabbitmqMessageRetriesTotal } from '../../observability/metrics';
import { logger } from '../../observability/logger';

const TOPOLOGY = retryTopologyFor('account.created');

export type AccountCreatedEvent = {
  accountId: string;
  userId: string;
  email: string;
  createdAt: string;
};

// The subset of amqplib's Channel this consumer actually needs — narrowed
// down (rather than importing the full Channel type) so tests can pass a
// plain jest-mocked object instead of a real broker connection.
export interface AmqpPublisher {
  ack(message: Message): void;
  sendToQueue(queue: string, content: Buffer, options?: Record<string, unknown>): boolean;
}

export interface AccountCreatedConsumerDeps {
  channel: AmqpPublisher;
  idempotencyRepository: IdempotencyRepository;
  topology?: RetryTopology;
  maxRetries?: number;
  backoffConfig?: BackoffConfigOverride;
  /** Called once processing succeeds — the "real work". Defaults to the simulated email log. */
  onProcessed?: (event: AccountCreatedEvent) => void | Promise<void>;
}

interface BackoffConfigOverride {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

// Pure, injectable core — see docs/resilience.md for the full retry/DLQ
// topology and idempotency semantics this implements. Factored out from the
// real entrypoint below (consumeAccountCreatedEvents) specifically so the
// retry-vs-DLQ decision, the backoff calculation, and the idempotency guard
// are all unit-testable against a mocked channel/repository — no RabbitMQ or
// Redis required — matching the issue's "tests should be deterministic and
// should not depend on an external internet service" requirement without
// needing test:concurrency-style real infrastructure for this consumer.
export function createAccountCreatedConsumer(deps: AccountCreatedConsumerDeps) {
  const topology = deps.topology ?? TOPOLOGY;
  const maxRetries = deps.maxRetries ?? resilienceConfig.rabbitmq.maxRetries;
  const backoffConfig: BackoffConfigOverride = deps.backoffConfig ?? {
    baseDelayMs: resilienceConfig.rabbitmq.retryDelayMs,
    maxDelayMs: resilienceConfig.http.retryMaxDelayMs,
    jitterMs: resilienceConfig.http.retryJitterMs,
  };
  const onProcessed =
    deps.onProcessed ??
    ((event: AccountCreatedEvent) => {
      // Simulated: no real email provider is called here, deliberately —
      // same mocked-external-integration spirit as MockExchangeRateProvider
      // and InMemoryComplianceChecker elsewhere in this codebase.
      logger.info(
        { accountId: event.accountId, email: event.email },
        `📧 Simulated: confirmation email sent to ${event.email}`
      );
    });

  async function handleMessage(message: Message): Promise<void> {
    const event = JSON.parse(message.content.toString()) as AccountCreatedEvent;
    // The outbox row's id (see rabbitmq-outbox-relay.ts) — stable across every
    // redelivery and every retry-queue round trip of this same logical
    // event, unlike a per-delivery value we'd have to invent ourselves.
    const dedupeKey = message.properties.messageId as string | undefined;

    if (!dedupeKey) {
      // No stable id to dedupe on (e.g. a message published by something
      // other than rabbitmq-outbox-relay.ts) — process it best-effort, same as
      // before this feature existed, rather than refusing to handle it.
      await processAndAck(message, event, null);
      return;
    }

    const claimed = await deps.idempotencyRepository.claim(dedupeKey);
    if (!claimed) {
      const alreadyProcessed = await deps.idempotencyRepository.findByKey(dedupeKey);
      if (alreadyProcessed) {
        // A duplicate delivery of an event we've already fully processed
        // (e.g. a redelivery after this consumer crashed just after
        // processing but before acking) — acknowledge without repeating the
        // side effect and move on. This is the "idempotent consumer" half
        // of RabbitMQ's at-least-once delivery: duplicates can arrive, but
        // never produce duplicate side effects.
        logger.info(
          { accountId: event.accountId, dedupeKey },
          'Duplicate account.created delivery, skipping'
        );
        deps.channel.ack(message);
        return;
      }
      // Someone else (another consumer instance, or an earlier delivery
      // still in flight) is already processing this exact event. Ack this
      // duplicate rather than reprocess it concurrently — see
      // docs/resilience.md for why this can occasionally mean a genuine
      // failure on the *other* delivery isn't retried by *this* one; the
      // in-flight claim's own TTL (see RedisIdempotencyRepository) is what
      // eventually clears a truly abandoned claim.
      logger.warn(
        { accountId: event.accountId, dedupeKey },
        'account.created already in flight, skipping'
      );
      deps.channel.ack(message);
      return;
    }

    await processAndAck(message, event, dedupeKey);
  }

  async function processAndAck(
    message: Message,
    event: AccountCreatedEvent,
    dedupeKey: string | null
  ): Promise<void> {
    try {
      await onProcessed(event);

      if (dedupeKey) {
        await deps.idempotencyRepository.save({ key: dedupeKey, response: true });
      }
      deps.channel.ack(message);
    } catch (error) {
      if (dedupeKey) {
        // Free the claim so the redelivered/retried copy of this same
        // event (same messageId) is allowed to attempt processing again,
        // instead of permanently reading as "in flight".
        await deps.idempotencyRepository.release(dedupeKey);
      }
      handleFailure(message, error);
    }
  }

  function handleFailure(message: Message, error: unknown): void {
    const retryCount = getRetryCount(message.properties.headers) + 1;

    if (retryCount > maxRetries) {
      logger.error(
        { error, retryCount, maxRetries },
        `account.created processing failed after ${maxRetries} retries, moving to DLQ`
      );
      deps.channel.sendToQueue(topology.dlq, message.content, {
        persistent: true,
        contentType: message.properties.contentType,
        messageId: message.properties.messageId,
        headers: { ...message.properties.headers, [RETRY_COUNT_HEADER]: retryCount },
      });
      rabbitmqDlqMessagesTotal.inc({ queue: topology.queue });
      // Successfully relocated the message to the DLQ — ack the original so
      // it isn't redelivered as if nothing had handled it (see the issue's
      // "failed processing must not ACK the message as successful"
      // requirement: this ack means "this delivery is resolved", not "the
      // business operation succeeded").
      deps.channel.ack(message);
      return;
    }

    const delayMs = computeBackoffDelayMs(retryCount, backoffConfig);

    logger.warn(
      { error, retryCount, maxRetries, delayMs },
      `account.created processing failed, retrying in ${delayMs}ms`
    );
    deps.channel.sendToQueue(topology.retryQueue, message.content, {
      persistent: true,
      contentType: message.properties.contentType,
      messageId: message.properties.messageId,
      headers: { ...message.properties.headers, [RETRY_COUNT_HEADER]: retryCount },
      expiration: String(Math.round(delayMs)),
    });
    rabbitmqMessageRetriesTotal.inc({ queue: topology.queue });
    deps.channel.ack(message);
  }

  return { handleMessage, topology };
}

// Runs as a separate process from the HTTP server (see the worker:* npm
// script) — the same "consumer is its own long-running process, not part of
// buildApp()" shape the old (broken, pre-pivot) transaction.worker.ts/
// rabbitmq-consumer.ts pair had, just against the current account domain
// and actually wired to real, existing modules this time.
export const consumeAccountCreatedEvents = async (): Promise<void> => {
  const { channel } = await connectRabbitMQ();
  await connectRedis();
  await assertRetryTopology(channel, TOPOLOGY);

  const { handleMessage } = createAccountCreatedConsumer({
    channel,
    idempotencyRepository: redisRegistry.idempotencyRepository,
    topology: TOPOLOGY,
  });

  logger.info(`Waiting for messages in ${TOPOLOGY.queue}...`);

  channel.consume(TOPOLOGY.queue, (message) => {
    if (!message) return;
    void handleMessage(message);
  });
};

// Guarded like server.ts's startServer(): only runs when this file is the
// actual entrypoint, so importing it elsewhere (e.g. a future test) doesn't
// also start consuming as a side effect of the import.
if (require.main === module) {
  consumeAccountCreatedEvents().catch((error) => {
    logger.error({ error }, 'Failed to start account.created consumer');
    process.exit(1);
  });
}
