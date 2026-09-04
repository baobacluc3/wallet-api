import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client?: Redis;
  constructor(private configService: ConfigService) {
    const enabled =
      this.configService.get<string>('REDIS_ENABLED', 'true').toLowerCase() ===
      'true';

    if (enabled) {
      this.client = new Redis(
        this.configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
      );
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

  onModuleDestroy(): void {
    this.client?.disconnect();
  }
}
