import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ClientCtx } from './decorators/client-context.decorator';
import type { RequestContext } from './decorators/client-context.decorator';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @ClientCtx() ctx: RequestContext) {
    return this.authService.register(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: RegisterDto, @ClientCtx() ctx: RequestContext) {
    return this.authService.register(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto, @ClientCtx() ctx: RequestContext) {
    return this.authService.refresh(dto.refreshToken, ctx);
  }

  // Guarded (not @Public) so we get req.user, and so a request with no/expired
  // access token still requires *something* valid to log out with.
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(dto: RefreshTokenDto, @CurrentUser() user: any, @Req() req: Request) {
    const authHeader = (req.headers.authorization ?? '').replace('Bearer ', '');
    const decoded = this.authService.decodeToken(authHeader);
    return this.authService.logout(
      user.id,
      dto.refreshToken,
      decoded.jti,
      decoded.exp,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: any) {
    return this.authService.logoutAll(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  private context(req: Request) {
    return {
      ip: req.ip ?? '',
      userAgent: (req.headers['user-agent'] as string) ?? '',
    };
  }
}
