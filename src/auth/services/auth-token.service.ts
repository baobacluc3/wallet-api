import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import {
  SessionMaterial,
  TokenPair,
} from '../interfaces/auth-token.interface';
import {
  generateOpaqueToken,
  hashToken,
} from '../utils/token.util';

@Injectable()
export class AuthTokenService {
  private readonly accessTokenTtl: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenTtl =
      this.configService.getOrThrow<number>(
        'JWT_ACCESS_TOKEN_TTL',
      );
  }

  signTokenPair(
    user: User,
    material: SessionMaterial,
  ): TokenPair {
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

  generateRefreshToken(): string {
    return generateOpaqueToken();
  }

  hashRefreshToken(rawToken: string): string {
    return hashToken(rawToken);
  }
}