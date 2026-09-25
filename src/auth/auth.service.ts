import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { AuthSession } from './entities/auth-session.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.users.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const user = await this.users.save(
      this.users.create({
        email,
        name: dto.name.trim(),
        passwordHash: await argon2.hash(dto.password),
      }),
    );

    return this.createAccessToken(user);
  }

  async login(user: User) {
    const session = this.sessionRepository.create({
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 ngày
      revokedAt: null,
      refreshTokenHash: '',
    });
    await this.sessionRepository.save(session);

    const accessToken = this.createAccessToken(user.id);
    const refreshToken = this.createRefreshToken(user.id, session.id);

    session.refreshTokenHash = await this.hashToken(refreshToken);
    await this.sessionRepository.save(session);
    return {
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    // 1. Verify JWT
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 2. Kiểm tra type
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const { sub: userId, sid: sessionId } = payload;

    // 3. Tìm session
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    // 4. Check session revoked?
    if (session.revokedAt) {
      throw new UnauthorizedException('Session has been revoked');
    }

    // 5. Check session expired?
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    // 6. Check refresh token thuộc session này không (so sánh hash)
    const isMatch = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash,
    );
    if (!isMatch) {
      // Có thể thêm logic reuse detection ở đây sau này (khi có jti)
      throw new UnauthorizedException('Refresh token does not match session');
    }

    // 7. Issue new tokens (rotation đơn giản)
    const newAccessToken = this.createAccessToken(userId);
    const newRefreshToken = this.createRefreshToken(userId, session.id);

    // 8. Update hash mới vào session
    session.refreshTokenHash = await this.hashToken(newRefreshToken);
    await this.sessionRepository.save(session);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(sessionId: string) {
    await this.sessionRepository.update(sessionId, {
      revokedAt: new Date(),
    });
  }

  private createAccessToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, type: 'access' },
      { expiresIn: '15m' },
    );
  }

  private createRefreshToken(userId: string, sessionId: string): string {
    return this.jwtService.sign(
      { sub: userId, sid: sessionId, type: 'refresh' },
      { expiresIn: '7d' },
    );
  }

  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }
}
