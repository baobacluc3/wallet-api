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

  // The global JWT guard protects this route and attaches req.user.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: AuthenticatedUser,
    @ClientCtx() ctx: RequestContext,
  ) {
    return this.authService.logout(
      user.id,
      dto.refreshToken,
      user.jti,
      user.expiresAt,
      ctx,
    );
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @ClientCtx() ctx: RequestContext,
  ) {
    return this.authService.logoutAll(user.id, ctx);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
