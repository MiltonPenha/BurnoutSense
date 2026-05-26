import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './types/authenticated-user';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() registerDto: RegisterDto, @Req() request: Request) {
    return this.authService.register(registerDto, this.getRequestContext(request));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() request: Request) {
    return this.authService.login(loginDto, this.getRequestContext(request));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(refreshTokenDto.refreshToken, this.getRequestContext(request));
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Body() logoutDto: LogoutDto) {
    return this.authService.logout(user.id, logoutDto.refreshToken);
  }

  private getRequestContext(request: Request) {
    return {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    };
  }
}
