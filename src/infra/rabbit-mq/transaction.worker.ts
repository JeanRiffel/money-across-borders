import { consumeMessages } from '../config/message-broker/rabbitmq-consumer';

export const consumeTransaction = async () => {
  await consumeMessages('transaction');
};

consumeTransaction();
