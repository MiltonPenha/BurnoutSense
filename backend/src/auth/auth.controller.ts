import { Body, Controller, Get, Header, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './types/authenticated-user';
import { AuthService } from './auth.service';
import { SessionSecurityService } from './session-security.service';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly security: SessionSecurityService,
    private readonly passwords: PasswordResetService) {}

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() payload: ForgotPasswordDto) { return this.passwords.request(payload.email); }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() payload: ResetPasswordDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.passwords.reset(payload.token, payload.password);
    this.security.clear(response);
    return result;
  }

  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  csrf(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return { csrfToken: this.security.csrfToken(request, response) };
  }

  @UseGuards(JwtAuthGuard)
  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@CurrentUser() user: AuthenticatedUser) { return { user: await this.auth.sessionUser(user.id) }; }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() payload: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.deliver(await this.auth.register(payload, this.context(request)), request, response);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() payload: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.deliver(await this.auth.login(payload, this.context(request)), request, response);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try { return this.deliver(await this.auth.refresh(this.security.read(request, this.security.refreshName)), request, response); }
    catch (error) { if (error instanceof UnauthorizedException) this.security.clear(response); throw error; }
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.logout(this.security.read(request, this.security.refreshName));
    this.security.clear(response); return result;
  }

  private deliver(result: Awaited<ReturnType<AuthService['login']>>, request: Request, response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return { user: result.user, csrfToken: this.security.setSession(request, response, result) };
  }

  private context(request: Request) { return { userAgent: request.headers['user-agent'], ipAddress: request.ip }; }
}
