import { redisClient } from '../../config/database/redis/redisClient';
import { RedisIdempotencyRepository } from './redis-idempotency-repository';

// Redis counterpart to postgres-registry.ts, imported by the factories that
// now use Redis for idempotency. Wraps the shared redisClient — the same
// pattern as pg.ts's bare `pool`: node-redis's client already manages its
// own connection lifecycle, so there's no per-repository state to inject
// here. The client is constructed (but not yet connected) the moment this
// module loads; connectRedis() is called separately from buildApp() before
// any request can reach a repository method, same as the Postgres
// reachability check.
export const redisRegistry = {
  idempotencyRepository: new RedisIdempotencyRepository(redisClient),
};
