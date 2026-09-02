import { Channel } from 'amqplib';

// Standard RabbitMQ "retry with delay via dead-letter exchange" recipe:
// three durable queues per consumer.
//
//   <queue>         — the real work queue; a consumer subscribes here.
//   <queue>.retry   — a parking-lot queue nothing consumes directly. Every
//                     message published here carries a per-message TTL
//                     (`expiration`, set by the consumer from the same
//                     backoff calculation the HTTP resilience layer uses —
//                     see backoff.ts) and this queue's own
//                     x-dead-letter-exchange/x-dead-letter-routing-key
//                     arguments point back at <queue>. When a message's TTL
//                     expires, RabbitMQ moves it back to <queue> on its own
//                     — no polling/sleeping process needed to implement the
//                     delay.
//   <queue>.dlq     — true dead end for messages that exhausted their
//                     retries; nothing ever republishes out of here. Meant
//                     for operator inspection (e.g. via the management UI),
//                     not automated draining.
//
// The retry count itself travels as an `x-retry-count` header on the
// message, incremented by the consumer on each failure — durable broker
// metadata, not in-memory state, so it survives a consumer process restart
// (see the issue's "avoid an in-memory retry counter" requirement).
export interface RetryTopology {
  queue: string;
  retryQueue: string;
  dlq: string;
}

export function retryTopologyFor(queue: string): RetryTopology {
  return {
    queue,
    retryQueue: `${queue}.retry`,
    dlq: `${queue}.dlq`,
  };
}

export async function assertRetryTopology(
  channel: Channel,
  topology: RetryTopology
): Promise<void> {
  await channel.assertQueue(topology.queue, { durable: true });

  await channel.assertQueue(topology.retryQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': topology.queue,
    },
  });

  await channel.assertQueue(topology.dlq, { durable: true });
}

export const RETRY_COUNT_HEADER = 'x-retry-count';

export function getRetryCount(headers: Record<string, unknown> | undefined): number {
  const raw = headers?.[RETRY_COUNT_HEADER];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}
