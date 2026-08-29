import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  constructor(private configService: ConfigService) {
    this.client = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  onModuleDestroy(): any {
    this.client.disconnect();
  }
}