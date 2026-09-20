import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ClientCtx } from './decorators/client-context.decorator';
import type { RequestContext } from './decorators/client-context.decorator';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @ClientCtx() ctx: RequestContext) {
    return this.authService.register(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @ClientCtx() ctx: RequestContext) {
    return this.authService.login(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto, @ClientCtx() ctx: RequestContext) {
    return this.authService.refresh(dto.refreshToken, ctx);
  }

  // The global JWT guard protects this route and attaches req.user. Session
  // identity comes from the access token; clients never need to re-submit a
  // long-lived refresh token just to sign out.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @ClientCtx() ctx: RequestContext,
  ): Promise<void> {
    await this.authService.logout(user.id, user.sessionId, ctx);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @ClientCtx() ctx: RequestContext,
  ): Promise<void> {
    await this.authService.logoutAll(user.id, ctx);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientCtx() ctx: RequestContext,
  ) {
    return this.authService.changePassword(user.id, dto, ctx);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
