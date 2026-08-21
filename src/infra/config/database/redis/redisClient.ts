import { createClient } from "redis";
import { logger } from "../../../observability/logger";

const redisClient = createClient({
  url: process.env.REDIS_HOST,
});

redisClient.on("error", (err) => logger.error({ err }, "Redis Client Error"));

await redisClient.connect();

logger.info("✅ Connected to Redis");

export default redisClient;
