import { Client } from '@elastic/elasticsearch'
import dotenv from 'dotenv'

// Self-contained on purpose — same rationale as pg.ts/redisClient.ts/
// kafka-connection.ts.
dotenv.config()

export const elasticsearchClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
})
