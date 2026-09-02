import { Message } from 'amqplib';
import {
  createAccountCreatedConsumer,
  AmqpPublisher,
  AccountCreatedEvent,
} from '../../../src/infra/events/consumers/account-created-consumer';
import { InMemoryIdempotencyRepository } from '../../../src/infra/persistence/in-memory/in-memory-idempotency-repository';
import { retryTopologyFor } from '../../../src/infra/config/message-broker/rabbitmq-retry-topology';

const TOPOLOGY = retryTopologyFor('account.created');

function makeEvent(overrides: Partial<AccountCreatedEvent> = {}): AccountCreatedEvent {
  return {
    accountId: 'acc-1',
    userId: 'user-1',
    email: 'jean@example.com',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMessage(
  event: AccountCreatedEvent,
  opts: { messageId?: string | null; retryCount?: number } = {}
): Message {
  const messageId = opts.messageId === undefined ? 'evt-1' : opts.messageId;
  return {
    content: Buffer.from(JSON.stringify(event)),
    fields: { deliveryTag: 1, redelivered: false, exchange: '', routingKey: TOPOLOGY.queue },
    properties: {
      contentType: 'application/json',
      contentEncoding: undefined,
      headers: opts.retryCount ? { 'x-retry-count': opts.retryCount } : {},
      deliveryMode: undefined,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId: messageId ?? undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  } as Message;
}

function makeChannel(): jest.Mocked<AmqpPublisher> {
  return {
    ack: jest.fn(),
    sendToQueue: jest.fn(),
  };
}

describe('account-created consumer (retry + DLQ + idempotency)', () => {
  const backoff = { baseDelayMs: 10, maxDelayMs: 100, jitterMs: 0 };

  it('13. acks a successfully processed message and never touches the retry/DLQ queues', async () => {
    const channel = makeChannel();
    const onProcessed = jest.fn();
    const { handleMessage } = createAccountCreatedConsumer({
      channel,
      idempotencyRepository: new InMemoryIdempotencyRepository(),
      maxRetries: 3,
      backoffConfig: backoff,
      onProcessed,
    });

    const message = makeMessage(makeEvent());
    await handleMessage(message);

    expect(onProcessed).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('14. republishes a failed message to the retry queue, incrementing x-retry-count', async () => {
    const channel = makeChannel();
    const { handleMessage } = createAccountCreatedConsumer({
      channel,
      idempotencyRepository: new InMemoryIdempotencyRepository(),
      maxRetries: 3,
      backoffConfig: backoff,
      onProcessed: () => {
        throw new Error('simulated processing failure');
      },
    });

    const message = makeMessage(makeEvent(), { retryCount: 1 });
    await handleMessage(message);

    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
    const [queue, , options] = channel.sendToQueue.mock.calls[0];
    expect(queue).toBe(TOPOLOGY.retryQueue);
    expect(options).toMatchObject({
      messageId: 'evt-1',
      headers: { 'x-retry-count': 2 },
    });
    expect(Number(options?.expiration)).toBeGreaterThan(0);
    // Failed processing must not ack as if it succeeded on its own — the
    // ack below only fires because the message was safely relocated to the
    // retry queue, not because the business operation succeeded.
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('15. the retry count travels as broker message metadata, not in-memory state', async () => {
    const channel = makeChannel();
    const { handleMessage } = createAccountCreatedConsumer({
      channel,
      idempotencyRepository: new InMemoryIdempotencyRepository(),
      maxRetries: 5,
      backoffConfig: backoff,
      onProcessed: () => {
        throw new Error('still failing');
      },
    });

    // Simulates a brand new consumer process picking up a message that was
    // already retried twice by a *previous* process instance — the count
    // comes back correctly because it's read from the message headers, not
    // from anything held in this process's memory.
    const message = makeMessage(makeEvent(), { retryCount: 2 });
    await handleMessage(message);

    const [, , options] = channel.sendToQueue.mock.calls[0];
    expect(options).toMatchObject({ headers: { 'x-retry-count': 3 } });
  });

  it('16. moves a message to the DLQ once it exceeds the maximum retries', async () => {
    const channel = makeChannel();
    const { handleMessage } = createAccountCreatedConsumer({
      channel,
      idempotencyRepository: new InMemoryIdempotencyRepository(),
      maxRetries: 3,
      backoffConfig: backoff,
      onProcessed: () => {
        throw new Error('permanently failing');
      },
    });

    // Already retried 3 times — this is the delivery that exhausts the budget.
    const message = makeMessage(makeEvent(), { retryCount: 3 });
    await handleMessage(message);

    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
    const [queue, , options] = channel.sendToQueue.mock.calls[0];
    expect(queue).toBe(TOPOLOGY.dlq);
    expect(options).toMatchObject({ messageId: 'evt-1', headers: { 'x-retry-count': 4 } });
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('17. does not produce a duplicate side effect for a message already processed (idempotent consumer)', async () => {
    const channel = makeChannel();
    const idempotencyRepository = new InMemoryIdempotencyRepository();
    const onProcessed = jest.fn();
    const { handleMessage } = createAccountCreatedConsumer({
      channel,
      idempotencyRepository,
      maxRetries: 3,
      backoffConfig: backoff,
      onProcessed,
    });

    const event = makeEvent();
    await handleMessage(makeMessage(event, { messageId: 'evt-dup' }));
    // A second, duplicate delivery of the exact same logical event (e.g. a
    // broker redelivery) — same messageId.
    await handleMessage(makeMessage(event, { messageId: 'evt-dup' }));

    expect(onProcessed).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledTimes(2);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('frees the idempotency claim on failure so a retried redelivery can be reprocessed', async () => {
    const channel = makeChannel();
    const idempotencyRepository = new InMemoryIdempotencyRepository();
    let attempt = 0;
    const { handleMessage } = createAccountCreatedConsumer({
      channel,
      idempotencyRepository,
      maxRetries: 3,
      backoffConfig: backoff,
      onProcessed: () => {
        attempt += 1;
        if (attempt === 1) throw new Error('fails once');
      },
    });

    const event = makeEvent();
    // First delivery fails and is sent to the retry queue.
    await handleMessage(makeMessage(event, { messageId: 'evt-retry-then-ok' }));
    // The retry queue's TTL expired and dead-lettered it back to the main
    // queue — same messageId, incremented header, now processed by the
    // *same* handler again (a fresh consumer process would look identical).
    await handleMessage(makeMessage(event, { messageId: 'evt-retry-then-ok', retryCount: 1 }));

    expect(attempt).toBe(2);
    expect(channel.ack).toHaveBeenCalledTimes(2);
    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
    expect(channel.sendToQueue.mock.calls[0][0]).toBe(TOPOLOGY.retryQueue);
  });

  it('processes best-effort when a message carries no messageId', async () => {
    const channel = makeChannel();
    const onProcessed = jest.fn();
    const { handleMessage } = createAccountCreatedConsumer({
      channel,
      idempotencyRepository: new InMemoryIdempotencyRepository(),
      maxRetries: 3,
      backoffConfig: backoff,
      onProcessed,
    });

    await handleMessage(makeMessage(makeEvent(), { messageId: null }));

    expect(onProcessed).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });
});
