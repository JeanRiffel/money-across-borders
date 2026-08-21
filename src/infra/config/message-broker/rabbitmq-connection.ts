import amqp from 'amqplib';
import { logger } from '../../observability/logger';

export const connectRabbitMQ = async () => {
    try {
        const connection = await amqp.connect('amqp://user:pass@localhost:5672');
        const channel = await connection.createChannel();
        logger.info('Connected to RabbitMQ');
        return { connection, channel };
    } catch (error) {
        logger.error({ error }, 'Error connecting to RabbitMQ');
        throw error;
    }
};
