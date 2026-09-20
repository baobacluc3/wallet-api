import { Injectable } from '@nestjs/common';
import { EntityManager, MoreThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

import { User } from '../../users/entities/user.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import type { RequestContext } from '../decorators/client-context.decorator';
import { SessionMaterial } from '../interfaces/auth-token.interface';
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class AuthSessionService {
  private readonly refreshTokenTtlDays: number;
  private readonly maxActiveSessions: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly authTokenService: AuthTokenService,
  ) {
    this.refreshTokenTtlDays = this.configService.getOrThrow<number>(
      'JWT_REFRESH_TOKEN_TTL_DAYS',
    );

    this.maxActiveSessions = this.configService.getOrThrow<number>(
      'AUTH_MAX_ACTIVE_SESSIONS',
    );
  }

  async createSession(
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

    const rawRefreshToken = this.authTokenService.generateRefreshToken();

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
        tokenHash: this.authTokenService.hashRefreshToken(rawRefreshToken),

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

    return {
      sessionId,
      rawRefreshToken,
    };
  }

  async enforceSessionLimit(
    manager: EntityManager,
    userId: number,
    now: Date,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(AuthSession)
      .set({
        revoked: true,
        revokedAt: now,
      })
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

      order: {
        createdAt: 'ASC',
      },
    });

    const numberToRevoke = Math.max(
      0,
      activeSessions.length - this.maxActiveSessions + 1,
    );

    const sessionsToRevoke = activeSessions.slice(0, numberToRevoke);

    if (!sessionsToRevoke.length) {
      return;
    }

    await this.revokeSessionIds(
      manager,
      sessionsToRevoke.map((session) => session.id),
      now,
    );
  }

  async revokeSession(
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
      .set({
        revoked: true,
        revokedAt: now,
      })
      .where('family_id = :sessionId', {
        sessionId: session.id,
      })
      .andWhere('revoked = false')
      .execute();
  }

  async revokeAllSessions(
    manager: EntityManager,
    userId: number,
    now: Date,
  ): Promise<void> {
    const sessions = await manager.find(AuthSession, {
      where: {
        userId,
        revoked: false,
      },
    });

    await this.revokeSessionIds(
      manager,
      sessions.map((session) => session.id),
      now,
    );
  }

  async revokeSessionIds(
    manager: EntityManager,
    sessionIds: string[],
    now: Date,
  ): Promise<void> {
    if (!sessionIds.length) {
      return;
    }

    await manager
      .createQueryBuilder()
      .update(AuthSession)
      .set({
        revoked: true,
        revokedAt: now,
      })
      .where('id IN (:...sessionIds)', { sessionIds })
      .andWhere('revoked = false')
      .execute();

    await manager
      .createQueryBuilder()
      .update(RefreshToken)
      .set({
        revoked: true,
        revokedAt: now,
      })
      .where('family_id IN (:...sessionIds)', { sessionIds })
      .andWhere('revoked = false')
      .execute();
  }

  lockSession(
    manager: EntityManager,
    sessionId: string,
    userId: number,
  ): Promise<AuthSession | null> {
    return manager.findOne(AuthSession, {
      where: {
        id: sessionId,
        userId,
      },

      lock: {
        mode: 'pessimistic_write',
      },
    });
  }
}
