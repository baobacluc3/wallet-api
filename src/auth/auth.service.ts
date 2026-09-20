import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DataSource, EntityManager, MoreThan, Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { User } from '../users/entities/user.entity';
import type { RequestContext } from './decorators/client-context.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthEventType } from './enums/auth-event-type.enum';
import { AuthEvent } from './entities/auth-event.entity';
import { AuthSession } from './entities/auth-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { generateOpaqueToken, hashToken } from './utils/token.util';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerException } from '@nestjs/throttler';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid refresh token';

// OWASP's Argon2id minimum profile (19 MiB / 2 iterations / one lane).
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

type SessionMaterial = {
  sessionId: string;
  rawRefreshToken: string;
};

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type RefreshOutcome =
  | { kind: 'issued'; user: User; material: SessionMaterial }
  | { kind: 'invalid' }
  | { kind: 'reuse' };

@Injectable()
export class AuthService {
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtlDays: number;
  private readonly maxFailedAttempts: number;
  private readonly lockoutMinutes: number;
  private readonly maxActiveSessions: number;
  private readonly rateLimitEnabled: boolean;
  private readonly rateLimitWindowSeconds: number;
  private readonly loginIpLimit: number;
  private readonly loginIdentifierLimit: number;
  private readonly registerIpLimit: number;
  private readonly refreshIpLimit: number;
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.accessTokenTtl = this.configService.getOrThrow<number>(
      'JWT_ACCESS_TOKEN_TTL',
    );
    this.refreshTokenTtlDays = this.configService.getOrThrow<number>(
      'JWT_REFRESH_TOKEN_TTL_DAYS',
    );
    this.maxFailedAttempts = this.configService.getOrThrow<number>(
      'AUTH_MAX_FAILED_ATTEMPTS',
    );
    this.lockoutMinutes = this.configService.getOrThrow<number>(
      'AUTH_LOCKOUT_MINUTES',
    );
    this.maxActiveSessions = this.configService.getOrThrow<number>(
      'AUTH_MAX_ACTIVE_SESSIONS',
    );
    this.rateLimitEnabled = this.configService.get<boolean>(
      'AUTH_RATE_LIMIT_ENABLED',
      false,
    );
    this.rateLimitWindowSeconds = this.configService.get<number>(
      'AUTH_RATE_LIMIT_WINDOW_SECONDS',
      60,
    );
    this.loginIpLimit = this.configService.get<number>(
      'AUTH_LOGIN_IP_LIMIT',
      10,
    );
    this.loginIdentifierLimit = this.configService.get<number>(
      'AUTH_LOGIN_IDENTIFIER_LIMIT',
      5,
    );
    this.registerIpLimit = this.configService.get<number>(
      'AUTH_REGISTER_IP_LIMIT',
      5,
    );
    this.refreshIpLimit = this.configService.get<number>(
      'AUTH_REFRESH_IP_LIMIT',
      30,
    );

    // Run the same expensive verification work for an unknown email. This
    // removes the large timing signal that otherwise exposes valid accounts.
    this.dummyPasswordHash = argon2.hash(
      randomBytes(32).toString('hex'),
      ARGON2_OPTIONS,
    );
  }

  async register(dto: RegisterDto, ctx: RequestContext): Promise<TokenPair> {
    const email = this.normalizeEmail(dto.email);
    await this.enforceRateLimit('register', ctx, this.registerIpLimit);
    const passwordHash = await this.hashPassword(dto.password);

    try {
      const issued = await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(User, { where: { email } });
        if (existing) {
          throw new ForbiddenException('Unable to register with these details');
        }

        const user = await manager.save(
          manager.create(User, {
            email,
            passwordHash,
            name: dto.name.trim(),
            isActive: true,
            authVersion: 1,
            failedLoginAttempts: 0,
            lockedUntil: null,
          }),
        );
        const material = await this.createSession(manager, user, ctx);
        await this.logEvent(manager, AuthEventType.REGISTER, user.id, ctx, {
          sessionId: material.sessionId,
        });

        return { user, material };
      });

      return this.signTokenPair(issued.user, issued.material);
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        // The pre-check is only an optimization; the database index is the
        // authoritative race-safe duplicate protection.
        throw new ForbiddenException('Unable to register with these details');
      }
      throw error;
    }
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<TokenPair> {
    const email = this.normalizeEmail(dto.email);
    await this.enforceRateLimit('login-ip', ctx, this.loginIpLimit);
    await this.enforceRateLimit(
      'login-identifier',
      ctx,
      this.loginIdentifierLimit,
      email,
    );

    // passwordHash is select:false, so it cannot leak from normal user reads.
    const candidate = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
    const hashToVerify = candidate
      ? candidate.passwordHash
      : await this.dummyPasswordHash;
    const passwordValid = await argon2.verify(hashToVerify, dto.password);

    if (!candidate || !passwordValid) {
      if (candidate) {
        await this.recordFailedAttempt(candidate.id, ctx);
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const issued = await this.dataSource.transaction((manager) =>
      this.completeSuccessfulLogin(
        manager,
        candidate.id,
        candidate.passwordHash,
        dto.password,
        ctx,
      ),
    );
    if (!issued) {
      // Locked, deactivated, or changed concurrently: deliberately use the
      // same response as a bad password so account state is not disclosed.
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.signTokenPair(issued.user, issued.material);
  }

  async refresh(
    rawRefreshToken: string,
    ctx: RequestContext,
  ): Promise<TokenPair> {
    await this.enforceRateLimit('refresh-ip', ctx, this.refreshIpLimit);
    await this.enforceRateLimit(
      'refresh-token',
      ctx,
      this.loginIdentifierLimit,
      hashToken(rawRefreshToken),
    );
    const tokenHash = hashToken(rawRefreshToken);

    const outcome = await this.dataSource.transaction<RefreshOutcome>(
      async (manager) => {
        // This lookup is intentionally unlocked. The user and then the
        // session are locked below in a single global order, avoiding races
        // with logout-all/password changes and with concurrent rotations.
        const locator = await manager.findOne(RefreshToken, {
          where: { tokenHash },
        });
        if (!locator) return { kind: 'invalid' };

        const user = await this.lockUser(manager, locator.userId);
        if (!user || !user.isActive) return { kind: 'invalid' };

        const session = await this.lockSession(
          manager,
          locator.familyId,
          user.id,
        );
        if (!session) return { kind: 'invalid' };

        const now = new Date();
        if (session.revoked) return { kind: 'invalid' };
        if (session.expiresAt <= now) {
          await this.revokeSession(manager, session, now);
          return { kind: 'invalid' };
        }

        // Re-read after acquiring the user/session locks. A simultaneous
        // request can have rotated this exact token while this request waited.
        const existingToken = await manager.findOne(RefreshToken, {
          where: { id: locator.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!existingToken) return { kind: 'invalid' };

        if (existingToken.revoked) {
          await this.revokeSession(manager, session, now);
          await this.logEvent(
            manager,
            AuthEventType.TOKEN_REUSE_DETECTED,
            user.id,
            ctx,
            { sessionId: session.id },
          );
          return { kind: 'reuse' };
        }
        if (existingToken.expiresAt <= now) {
          await this.revokeSession(manager, session, now);
          return { kind: 'invalid' };
        }

        const rawNewRefreshToken = generateOpaqueToken();
        const newToken = await manager.save(
          manager.create(RefreshToken, {
            tokenHash: hashToken(rawNewRefreshToken),
            familyId: session.id,
            userId: user.id,
            expiresAt: session.expiresAt,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          }),
        );

        existingToken.revoked = true;
        existingToken.revokedAt = now;
        existingToken.replacedByTokenId = newToken.id;
        await manager.save(existingToken);

        session.lastUsedAt = now;
        await manager.save(session);
        await this.logEvent(manager, AuthEventType.TOKEN_ROTATED, user.id, ctx, {
          sessionId: session.id,
        });

        return {
          kind: 'issued',
          user,
          material: {
            sessionId: session.id,
            rawRefreshToken: rawNewRefreshToken,
          },
        };
      },
    );

    if (outcome.kind !== 'issued') {
      // Do not reveal whether this was expired, revoked, unknown, or a reuse
      // event. Reuse is still recorded transactionally in the audit trail.
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    return this.signTokenPair(outcome.user, outcome.material);
  }

  async logout(
    userId: number,
    sessionId: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager, userId);
      if (!user) return;

      const session = await this.lockSession(manager, sessionId, user.id);
      if (!session) return;

      await this.revokeSession(manager, session, new Date());
      await this.logEvent(manager, AuthEventType.LOGOUT, user.id, ctx, {
        sessionId,
      });
    });
  }

  async logoutAll(userId: number, ctx: RequestContext): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager, userId);
      if (!user) return;

      const now = new Date();
      user.authVersion += 1;
      await manager.save(user);
      await this.revokeAllSessions(manager, user.id, now);
      await this.logEvent(manager, AuthEventType.LOGOUT_ALL, user.id, ctx);
    });
  }

  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    ctx: RequestContext,
  ): Promise<TokenPair> {
    await this.enforceRateLimit(
      'password-change',
      ctx,
      this.loginIdentifierLimit,
      String(userId),
    );

    const issued = await this.dataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager, userId);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Authentication is no longer valid');
      }

      const currentPasswordMatches = await argon2.verify(
        user.passwordHash,
        dto.currentPassword,
      );
      if (!currentPasswordMatches) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      if (await argon2.verify(user.passwordHash, dto.newPassword)) {
        throw new BadRequestException(
          'New password must differ from the current password',
        );
      }

      const now = new Date();
      user.passwordHash = await this.hashPassword(dto.newPassword);
      user.authVersion += 1;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await manager.save(user);
      await this.revokeAllSessions(manager, user.id, now);

      const material = await this.createSession(manager, user, ctx, now);
      await this.logEvent(
        manager,
        AuthEventType.PASSWORD_CHANGED,
        user.id,
        ctx,
        { sessionId: material.sessionId },
      );
      return { user, material };
    });

    return this.signTokenPair(issued.user, issued.material);
  }

  private async completeSuccessfulLogin(
    manager: EntityManager,
    userId: number,
    observedPasswordHash: string,
    password: string,
    ctx: RequestContext,
  ): Promise<{ user: User; material: SessionMaterial } | null> {
    const user = await this.lockUser(manager, userId);
    if (!user || !user.isActive) return null;

    // A password change can race the initial verification. Re-verify while
    // holding the user lock rather than issuing a session for an old password.
    if (
      user.passwordHash !== observedPasswordHash &&
      !(await argon2.verify(user.passwordHash, password))
    ) {
      await this.registerFailedAttemptLocked(manager, user, ctx);
      return null;
    }

    const now = new Date();
    // A correct password releases a temporary lock. This still throttles bad
    // guesses, while preventing anyone who knows an email address from
    // indefinitely denying the legitimate account owner access.

    if (argon2.needsRehash(user.passwordHash, ARGON2_OPTIONS)) {
      user.passwordHash = await this.hashPassword(password);
    }
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await manager.save(user);

    const material = await this.createSession(manager, user, ctx, now);
    await this.logEvent(manager, AuthEventType.LOGIN_SUCCESS, user.id, ctx, {
      sessionId: material.sessionId,
    });
    return { user, material };
  }

  private async recordFailedAttempt(
    userId: number,
    ctx: RequestContext,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager, userId);
      if (!user) return;
      await this.registerFailedAttemptLocked(manager, user, ctx);
    });
  }

  private async registerFailedAttemptLocked(
    manager: EntityManager,
    user: User,
    ctx: RequestContext,
  ): Promise<void> {
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) return;
    if (user.lockedUntil && user.lockedUntil <= now) {
      user.lockedUntil = null;
      user.failedLoginAttempts = 0;
    }

    user.failedLoginAttempts += 1;
    const accountLocked = user.failedLoginAttempts >= this.maxFailedAttempts;
    if (accountLocked) {
      user.lockedUntil = new Date(
        now.getTime() + this.lockoutMinutes * 60 * 1000,
      );
    }
    await manager.save(user);
    await this.logEvent(manager, AuthEventType.LOGIN_FAILED, user.id, ctx);
    if (accountLocked) {
      await this.logEvent(manager, AuthEventType.ACCOUNT_LOCKED, user.id, ctx);
    }
  }

  private async createSession(
    manager: EntityManager,
    user: User,
    ctx: RequestContext,
    now = new Date(),
  ): Promise<SessionMaterial> {
    await this.enforceSessionLimit(manager, user.id, now);

    const sessionId = randomUUID();
    const expiresAt = new Date(
      now.getTime() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );
    const rawRefreshToken = generateOpaqueToken();
    await manager.save(
      manager.create(AuthSession, {
        id: sessionId,
        userId: user.id,
        expiresAt,
        lastUsedAt: now,
        revoked: false,
        revokedAt: null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      }),
    );
    await manager.save(
      manager.create(RefreshToken, {
        tokenHash: hashToken(rawRefreshToken),
        familyId: sessionId,
        userId: user.id,
        expiresAt,
        revoked: false,
        revokedAt: null,
        replacedByTokenId: null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      }),
    );

    return { sessionId, rawRefreshToken };
  }

  private async enforceSessionLimit(
    manager: EntityManager,
    userId: number,
    now: Date,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revoked: true, revokedAt: now })
      .where('user_id = :userId', { userId })
      .andWhere('revoked = false')
      .andWhere('expires_at <= :now', { now })
      .execute();

    const activeSessions = await manager.find(AuthSession, {
      where: {
        userId,
        revoked: false,
        expiresAt: MoreThan(now),
      },
      order: { createdAt: 'ASC' },
    });
    const sessionsToRevoke = activeSessions.slice(
      0,
      Math.max(0, activeSessions.length - this.maxActiveSessions + 1),
    );
    if (sessionsToRevoke.length) {
      await this.revokeSessionIds(
        manager,
        sessionsToRevoke.map((session) => session.id),
        now,
      );
    }
  }

  private async revokeAllSessions(
    manager: EntityManager,
    userId: number,
    now: Date,
  ): Promise<void> {
    const sessions = await manager.find(AuthSession, {
      where: { userId, revoked: false },
    });
    await this.revokeSessionIds(
      manager,
      sessions.map((session) => session.id),
      now,
    );
  }

  private async revokeSession(
    manager: EntityManager,
    session: AuthSession,
    now: Date,
  ): Promise<void> {
    if (!session.revoked) {
      session.revoked = true;
      session.revokedAt = now;
      await manager.save(session);
    }
    await manager
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revoked: true, revokedAt: now })
      .where('family_id = :sessionId', { sessionId: session.id })
      .andWhere('revoked = false')
      .execute();
  }

  private async revokeSessionIds(
    manager: EntityManager,
    sessionIds: string[],
    now: Date,
  ): Promise<void> {
    if (!sessionIds.length) return;

    await manager
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revoked: true, revokedAt: now })
      .where('id IN (:...sessionIds)', { sessionIds })
      .andWhere('revoked = false')
      .execute();
    await manager
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revoked: true, revokedAt: now })
      .where('family_id IN (:...sessionIds)', { sessionIds })
      .andWhere('revoked = false')
      .execute();
  }

  private async lockUser(
    manager: EntityManager,
    userId: number,
  ): Promise<User | null> {
    return manager
      .createQueryBuilder(User, 'user')
      .addSelect('user.passwordHash')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
  }

  private lockSession(
    manager: EntityManager,
    sessionId: string,
    userId: number,
  ): Promise<AuthSession | null> {
    return manager.findOne(AuthSession, {
      where: { id: sessionId, userId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private signTokenPair(user: User, material: SessionMaterial): TokenPair {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
      sid: material.sessionId,
      ver: user.authVersion,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.accessTokenTtl,
    });

    return {
      accessToken,
      refreshToken: material.rawRefreshToken,
      expiresIn: this.accessTokenTtl,
    };
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  private async logEvent(
    manager: EntityManager,
    type: AuthEventType,
    userId: number,
    ctx: RequestContext,
    meta: Record<string, unknown> | null = null,
  ): Promise<void> {
    await manager.insert(AuthEvent, {
      type,
      userId,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      meta: meta
        ? { ...meta, requestId: ctx.requestId }
        : { requestId: ctx.requestId },
    });
  }

  private async enforceRateLimit(
    scope: string,
    ctx: RequestContext,
    limit: number,
    identifier?: string,
  ): Promise<void> {
    if (!this.rateLimitEnabled) return;

    const keyMaterial = identifier ?? ctx.ip ?? 'unknown-client';
    const key = createHash('sha256').update(keyMaterial).digest('hex');
    const result = await this.redisService.consumeRateLimit(
      `rl:auth:${scope}:${key}`,
      limit,
      this.rateLimitWindowSeconds,
    );
    if (!result.allowed) {
      throw new ThrottlerException('Too many authentication attempts');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
