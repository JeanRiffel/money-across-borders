import {
  assertRetryTopology,
  getRetryCount,
  retryTopologyFor,
} from '../../../../src/infra/config/message-broker/rabbitmq-retry-topology';

describe('retryTopologyFor', () => {
  it('derives retry and DLQ queue names from the main queue name', () => {
    expect(retryTopologyFor('account.created')).toEqual({
      queue: 'account.created',
      retryQueue: 'account.created.retry',
      dlq: 'account.created.dlq',
    });
  });
});

describe('getRetryCount', () => {
  it('defaults to 0 when there are no headers', () => {
    expect(getRetryCount(undefined)).toBe(0);
  });

  it('defaults to 0 when the header is absent', () => {
    expect(getRetryCount({})).toBe(0);
  });

  it('reads the x-retry-count header', () => {
    expect(getRetryCount({ 'x-retry-count': 2 })).toBe(2);
  });

  it('ignores a non-numeric value', () => {
    expect(getRetryCount({ 'x-retry-count': 'not-a-number' })).toBe(0);
  });
});

describe('assertRetryTopology', () => {
  it('declares the main, retry, and DLQ queues with the right dead-letter arguments', async () => {
    const assertQueue = jest.fn().mockResolvedValue(undefined);
    const channel = { assertQueue } as unknown as Parameters<typeof assertRetryTopology>[0];

    await assertRetryTopology(channel, retryTopologyFor('account.created'));

    expect(assertQueue).toHaveBeenCalledWith('account.created', { durable: true });
    expect(assertQueue).toHaveBeenCalledWith('account.created.retry', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'account.created',
      },
    });
    expect(assertQueue).toHaveBeenCalledWith('account.created.dlq', { durable: true });
  });
});
