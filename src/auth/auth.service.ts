import { ForbiddenException, Injectable } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AuthEvent } from './entities/auth-event.entity';
import { AuthEventType } from './enums/auth-event-type.enum';
import { randomUUID } from 'crypto';
import { JwtPayLoad } from './interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { generateOpaqueToken, hashToken } from './utils/token.util';
import { RefreshToken } from './entities/refresh-token.entity';

interface RequestContext {
  ip: string;
  userAgent: string;
}
@Injectable()
export class AuthService {
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtlDays: number;

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(AuthEvent)
    private authEventRepository: Repository<AuthEvent>,
    private jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
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
}
