import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { DataSource, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AuthEvent } from './entities/auth-event.entity';
import { AuthEventType } from './enums/auth-event-type.enum';
import { randomUUID } from 'crypto';
import { JwtPayLoad } from './interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { generateOpaqueToken, hashToken } from './utils/token.util';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { ExternalContextCreator } from '@nestjs/core';
import type { RequestContext } from './decorators/client-context.decorator';

@Injectable()
export class AuthService {
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtlDays: number;
  private readonly maxFailedAttempts: number;
  private readonly lockoutMinutes: number;

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(AuthEvent)
    private authEventRepository: Repository<AuthEvent>,
    private jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}
  async register(dto: RegisterDto, ctx: RequestContext) {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ForbiddenException('Unable to register with these details');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.userRepository.save(
      this.userRepository.create({
        email: dto.email,
        passwordHash,
        name: dto.name,
      }),
    );

    await this.logEvent(AuthEventType.REGISTER, user.id, ctx);
    return this.issueTokenPair(user, ctx);
  }

  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Account temporarily locked. Try again after ${user.lockedUntil.toISOString()}`,
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      await this.registerFailedAttempt(user, ctx);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await this.userRepository.save(user);
    }
    await this.logEvent(AuthEventType.LOGIN_SUCCESS, user.id, ctx);
    return this.issueTokenPair(user, ctx);
  }

  async refresh(rawRefreshToken: string, ctx: RequestContext) {
    const tokenHash = hashToken(rawRefreshToken);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      //finds a refresh-token row in the database and locks that row so concurrent requests cannot modify it at the same time.
      const existingToken = await queryRunner.manager.findOne(RefreshToken, {
        where: { tokenHash },
        relations: { user: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!existingToken) {
        throw new UnauthorizedException('invalid refresh token');
      }
      if (existingToken.revoked) {
        await queryRunner.manager.update(
          RefreshToken,
          { familyId: existingToken.familyId, revoked: false },
          { revoked: true, revokedAt: new Date() },
        );
        await queryRunner.commitTransaction();
        await this.logEvent(
          AuthEventType.TOKEN_REUSE_DETECTED,
          existingToken.userId,
          ctx,
          { familyId: existingToken.familyId },
        );
        throw new UnauthorizedException(
          'Refresh token reuse detected. All sessions have been revoked — please log in again.',
        );
      }
      if (existingToken.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }
      const { user } = existingToken;
      const jti = randomUUID();
      const payload: JwtPayLoad = {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti,
      };
      const accessToken = this.jwtService.sign(payload, {
        expiresIn: this.accessTokenTtl,
      });
      const rawNewRefreshToken = generateOpaqueToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.refreshTokenTtlDays);
      const newToken = queryRunner.manager.create(RefreshToken, {
        tokenHash: hashToken(rawNewRefreshToken),
        familyId: existingToken.familyId,
        userId: existingToken.userId,
        expiresAt,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      await queryRunner.manager.save(newToken);
      existingToken.revoked = true;
      existingToken.revokedAt = new Date();
      existingToken.replacedByTokenId = newToken.id;
      await queryRunner.manager.save(existingToken);
      await queryRunner.commitTransaction();

      await this.logEvent(AuthEventType.TOKEN_ROTATED, user.id, ctx, {
        familyId: existingToken.familyId,
      });
      return {
        accessToken,
        refreshToken: rawNewRefreshToken,
        expiresIn: this.accessTokenTtl,
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async logout(
    userId: number,
    rawRefreshToken: string,
    jti: string,
    exp: number,
  ) {
    const tokenHash = hashToken(rawRefreshToken);
    await this.refreshTokenRepository.update(
      { tokenHash, userId },
      { revoked: true, revokedAt: new Date() },
    );
  }

  private async logEvent(
    type: AuthEventType,
    userId: number,
    ctx: RequestContext,
    meta: Record<string, unknown> | null = null,
  ) {
    await this.authEventRepository.save(
      this.authEventRepository.create({
        type,
        userId,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        meta,
      }),
    );
  }

  private async issueTokenPair(user: User, ctx: RequestContext) {
    const jti = randomUUID();
    const payload: JwtPayLoad = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.accessTokenTtl,
    });

    const rawRefreshToken = generateOpaqueToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenTtlDays);

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        tokenHash: hashToken(rawRefreshToken),
        familyId: randomUUID(),
        userId: user.id,
        expiresAt,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      }),
    );

    return {
      accessToken,
      RefreshToken: rawRefreshToken,
      expiresIn: this.accessTokenTtl,
    };
  }

  private async registerFailedAttempt(user: User, ctx: RequestContext) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= this.maxFailedAttempts) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + this.lockoutMinutes);
      user.lockedUntil = lockedUntil;
      await this.logEvent(AuthEventType.ACCOUNT_LOCKED, user.id, ctx);
    }
    await this.userRepository.save(user);
    await this.logEvent(AuthEventType.LOGIN_FAILED, user.id, ctx);
  }
}
