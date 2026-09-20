import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const RATE_LIMIT_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return { current, redis.call('TTL', KEYS[1]) }
`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client?: Redis;

  constructor(private configService: ConfigService) {
    const enabled = this.configService.get<boolean>('REDIS_ENABLED', false);

    if (enabled) {
      this.client = new Redis(
        this.configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        {
          connectTimeout: 2_000,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
        },
      );
      this.client.on('error', (error: Error) => {
        // ioredis emits errors rather than throwing them from the constructor.
        // Individual security-sensitive operations fail closed below.
        this.logger.warn(`Redis connection error: ${error.message}`);
      });
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;

    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;

    const result = await this.client.exists(key);
    return result === 1;
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;

    await this.client.del(key);
  }

  /** Atomically consumes one fixed-window rate-limit slot. */
  async consumeRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Authentication rate limiting is unavailable',
      );
    }

    try {
      const response = (await this.client.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        String(windowSeconds),
      )) as [number, number];
      const [count, ttl] = response;
      return {
        allowed: count <= limit,
        retryAfterSeconds: Math.max(ttl, 1),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis rate-limit operation failed: ${message}`);
      // If the distributed limiter is enabled, fail closed instead of silently
      // removing brute-force protection during a Redis outage.
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
      );
    }
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }
}
