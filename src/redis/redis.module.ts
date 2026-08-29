import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

// @Global so any module can inject RedisService without re-importing this
// everywhere (the JwtStrategy needs it, logout needs it, etc.)
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
