import { InputTransactionDTO } from '../../../application/transaction/inputTransactionDTO';

import { connectRabbitMQ } from './rabbitmq-connection';

export const sendMessage = async (queue: string, message: InputTransactionDTO) => {
  const { channel } = await connectRabbitMQ();
  await channel.assertQueue(queue, { durable: true });
  const body = Buffer.from(JSON.stringify(message));
  channel.sendToQueue(queue, body, {
    persistent: true,
    contentType: 'application/json',
  });
};
