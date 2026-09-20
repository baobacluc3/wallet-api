import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Role } from '../users/enums/role.enum';
import { User } from '../users/entities/user.entity';
import { AuthSession } from './entities/auth-session.entity';
import { JwtStrategy } from './jwt.strategy';

const JTI = 'c0a8012e-51d5-4e42-a08c-e44d9f2cad27';
const SESSION_ID = '5a8499d8-9d44-4454-85ed-52aa3d2c7797';

describe('JwtStrategy', () => {
  const createStrategy = (options?: {
    user?: Partial<User> | null;
    session?: Partial<AuthSession> | null;
  }) => {
    const config = {
      getOrThrow: jest.fn((key: string) =>
        ({
          JWT_SECRET: 'test-secret-that-is-long-enough-for-unit-tests',
          JWT_ISSUER: 'wallet-api',
          JWT_AUDIENCE: 'wallet-api-clients',
        })[key],
      ),
    } as unknown as ConfigService;
    const users = {
      findOne: jest.fn().mockResolvedValue(
        options?.user === undefined
          ? {
              id: 7,
              email: 'current@example.com',
              role: Role.ADMIN,
              isActive: true,
              authVersion: 3,
            }
          : options.user,
      ),
    } as unknown as Repository<User>;
    const sessions = {
      findOne: jest.fn().mockResolvedValue(
        options?.session === undefined
          ? { id: SESSION_ID, userId: 7, revoked: false }
          : options.session,
      ),
    } as unknown as Repository<AuthSession>;
    return {
      strategy: new JwtStrategy(config, users, sessions),
      users,
      sessions,
    };
  };

  const payload = {
    sub: 7,
    email: 'old@example.com',
    role: Role.USER,
    jti: JTI,
    sid: SESSION_ID,
    ver: 3,
    exp: 1_800_000_000,
  };

  it('maps verified claims to current server-side identity and session state', async () => {
    const { strategy, users, sessions } = createStrategy();

    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 7,
      email: 'current@example.com',
      role: Role.ADMIN,
      jti: JTI,
      sessionId: SESSION_ID,
      expiresAt: 1_800_000_000,
    });
    expect(users.findOne).toHaveBeenCalledWith({
      where: { id: 7, isActive: true, authVersion: 3 },
    });
    expect(sessions.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SESSION_ID,
          userId: 7,
          revoked: false,
        }),
      }),
    );
  });

  it('rejects malformed claims before querying persistence', async () => {
    const { strategy, users, sessions } = createStrategy();

    await expect(
      strategy.validate({ ...payload, sid: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.findOne).not.toHaveBeenCalled();
    expect(sessions.findOne).not.toHaveBeenCalled();
  });

  it('rejects a deactivated/version-mismatched user or revoked session', async () => {
    const { strategy: missingUserStrategy } = createStrategy({ user: null });
    await expect(missingUserStrategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const { strategy: revokedSessionStrategy } = createStrategy({
      session: null,
    });
    await expect(revokedSessionStrategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
