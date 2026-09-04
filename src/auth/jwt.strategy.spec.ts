import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../users/enums/role.enum';
import { RedisService } from '../redis/redis.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const createStrategy = (isBlacklisted = false) => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    const redis = {
      exists: jest.fn().mockResolvedValue(isBlacklisted),
    } as unknown as RedisService;
    return { strategy: new JwtStrategy(config, redis), redis };
  };

  it('maps verified claims to the safe request identity', async () => {
    const { strategy, redis } = createStrategy();

    await expect(
      strategy.validate({
        sub: 7,
        email: 'user@example.com',
        role: Role.USER,
        jti: 'token-id',
        exp: 1_800_000_000,
      }),
    ).resolves.toEqual({
      id: 7,
      email: 'user@example.com',
      role: Role.USER,
      jti: 'token-id',
      expiresAt: 1_800_000_000,
    });
    expect(redis.exists).toHaveBeenCalledWith('bl:token-id');
  });

  it('rejects malformed and revoked tokens', async () => {
    const { strategy } = createStrategy();
    await expect(
      strategy.validate({
        sub: 7,
        email: 'user@example.com',
        role: Role.USER,
        jti: 'token-id',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const { strategy: revokedStrategy } = createStrategy(true);
    await expect(
      revokedStrategy.validate({
        sub: 7,
        email: 'user@example.com',
        role: Role.USER,
        jti: 'token-id',
        exp: 1_800_000_000,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
