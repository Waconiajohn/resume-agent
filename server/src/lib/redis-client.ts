import Redis from 'ioredis';
import logger from './logger.js';

let redisClient: Redis | null = null;

/**
 * Returns the singleton Redis client, creating it lazily on first call.
 *
 * Returns null if REDIS_URL is not set or if the client creation fails.
 * The client is configured with a short connectTimeout and maxRetriesPerRequest=1
 * so that rate-limit fallback to in-memory happens quickly on Redis unavailability.
 */
export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    redisClient.on('error', (err: Error) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Redis connection error',
      );
    });

    return redisClient;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to create Redis client',
    );
    return null;
  }
}

/**
 * Gracefully closes the Redis connection.
 * Safe to call even if Redis was never connected.
 */
export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
  }
}

/**
 * Test-only: reset the module-level singleton so tests can start fresh.
 * Not exported in production paths — only called via dynamic import in tests.
 */
export function resetRedisClientForTests(): void {
  redisClient = null;
}
