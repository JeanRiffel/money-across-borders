import { createClient } from "redis";
import { logger } from "../../../observability/logger";

// REDIS_HOST/REDIS_PORT/REDIS_PASSWORD, matching the HOST/PORT/PASSWORD
// convention every other service in .env(.example) already uses
// (POSTGRES_*, MONGO_*, RABBITMQ_*) — a prior version of this file read a
// single REDIS_URL instead, which this project's .env never defined, so it
// silently fell back to node-redis's own redis://localhost:6379 default and
// ignored REDIS_HOST/REDIS_PORT/REDIS_PASSWORD entirely.
const host = process.env.REDIS_HOST || "localhost";
const port = process.env.REDIS_PORT || "6379";
const password = process.env.REDIS_PASSWORD;

const redisClient = createClient({
  url: `redis://${host}:${port}`,
  // Passed as its own option rather than embedded in the URL string, so a
  // password containing characters like @ or : doesn't need manual
  // URL-encoding to parse correctly.
  ...(password ? { password } : {}),
});

redisClient.on("error", (err) => logger.error({ err }, "Redis Client Error"));

let connectPromise: Promise<typeof redisClient> | null = null;

// Connecting used to happen via a top-level `await redisClient.connect()`,
// which ran the moment anything imported this module — including, e.g., a
// factory pulled in transitively by a Jest test, with no way to catch or
// control the failure. Deferred behind an explicit call instead, mirroring
// how pool.query('SELECT 1') is invoked from buildApp() for Postgres rather
// than at import time. Idempotent/memoized so every caller (buildApp(), any
// factory) can call it freely without opening a second connection.
export async function connectRedis(): Promise<typeof redisClient> {
  if (!connectPromise) {
    connectPromise = redisClient.connect().then(() => {
      logger.info("✅ Connected to Redis");
      return redisClient;
    });
  }
  return connectPromise;
}

export { redisClient };
