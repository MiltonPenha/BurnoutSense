import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuthSession, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly passwordHashRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto, context: RequestContext) {
    const email = registerDto.email.toLowerCase().trim();
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email already registered.');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, this.passwordHashRounds);
    const user = await this.usersService.create({
      name: registerDto.name.trim(),
      email,
      passwordHash,
    });

    return this.issueAuthResponse(user, context);
  }

  async login(loginDto: LoginDto, context: RequestContext) {
    const user = await this.usersService.findByEmail(loginDto.email.toLowerCase().trim());

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(loginDto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueAuthResponse(user, context);
  }

  async refresh(refreshToken: string, context: RequestContext) {
    const sessionId = this.extractSessionId(refreshToken);

    if (!sessionId) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const tokenMatches = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    if (!tokenMatches) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    await this.revokeSession(session.id);

    return this.issueAuthResponse(session.user, context);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const sessionId = this.extractSessionId(refreshToken);

      if (sessionId) {
        await this.prisma.authSession.updateMany({
          where: { id: sessionId, userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } else {
      await this.prisma.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out successfully.' };
  }

  private async issueAuthResponse(user: User, context: RequestContext) {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id, context);

    return {
      accessToken,
      refreshToken,
      user: this.usersService.toSafeUser(user),
    };
  }

  private signAccessToken(user: User) {
    const signOptions: JwtSignOptions = {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
        '15m') as JwtSignOptions['expiresIn'],
    };

    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      signOptions,
    );
  }

  private async createRefreshToken(userId: string, context: RequestContext) {
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: 'pending',
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: this.getRefreshTokenExpirationDate(),
      },
    });
    const refreshToken = `${session.id}.${randomBytes(64).toString('base64url')}`;
    const refreshTokenHash = await bcrypt.hash(refreshToken, this.passwordHashRounds);

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { refreshTokenHash },
    });

    return refreshToken;
  }

  private extractSessionId(refreshToken: string) {
    const [sessionId] = refreshToken.split('.');
    return sessionId || null;
  }

  private revokeSession(sessionId: AuthSession['id']) {
    return this.prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  private getRefreshTokenExpirationDate() {
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const match = expiresIn.match(/^(\d+)([dhm])$/);

    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multiplierByUnit: Record<string, number> = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multiplierByUnit[unit]);
  }
}
