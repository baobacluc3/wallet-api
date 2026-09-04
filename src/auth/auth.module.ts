import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthEvent } from './entities/auth-event.entity';
import { RefreshToken } from './entities/refresh-token.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuthEvent, RefreshToken]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<StringValue>('JWT_EXPIRES_IN') ?? '15m',
        },
      }),
    }),
  ],

  controllers: [AuthController],
  providers: [JwtStrategy, AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
