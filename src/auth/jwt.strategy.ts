import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from '../redis/redis.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // AuthModule signs with HS256, therefore verification must use the same secret.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!Number.isSafeInteger(payload.exp)) {
      throw new UnauthorizedException('Invalid access token');
    }
    const expiresAt = payload.exp as number;

    const isBlacklisted = await this.redisService.exists(`bl:${payload.jti}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
      expiresAt,
    };
  }
}
