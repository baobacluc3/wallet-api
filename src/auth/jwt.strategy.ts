import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { MoreThan, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';
import { AuthSession } from './entities/auth-session.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // AuthModule signs with HS256, therefore verification must use the same
      // algorithm, issuer, audience, and key here.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: configService.getOrThrow<string>('JWT_ISSUER'),
      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),
      jsonWebTokenOptions: { clockTolerance: 5 },
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!this.hasValidClaims(payload)) {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.userRepository.findOne({
      where: {
        id: payload.sub,
        isActive: true,
        authVersion: payload.ver,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid access token');
    }

    const session = await this.sessionRepository.findOne({
      where: {
        id: payload.sid,
        userId: user.id,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      // Do not trust mutable authorization fields from a signed-but-stale JWT.
      // Current database values make role changes and deactivation immediate.
      id: user.id,
      email: user.email,
      role: user.role,
      jti: payload.jti,
      sessionId: session.id,
      expiresAt: payload.exp,
    };
  }

  private hasValidClaims(payload: JwtPayload): payload is JwtPayload & {
    exp: number;
  } {
    return (
      Number.isSafeInteger(payload.sub) &&
      payload.sub > 0 &&
      typeof payload.email === 'string' &&
      payload.email.length > 0 &&
      payload.email.length <= 320 &&
      Object.values(Role).includes(payload.role) &&
      this.isUuid(payload.jti) &&
      this.isUuid(payload.sid) &&
      Number.isSafeInteger(payload.ver) &&
      payload.ver > 0 &&
      Number.isSafeInteger(payload.exp)
    );
  }

  private isUuid(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    );
  }
}
