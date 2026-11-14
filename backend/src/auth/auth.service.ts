import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionSecurityService } from './session-security.service';

interface RequestContext { userAgent?: string; ipAddress?: string }
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly jwt: JwtService, private readonly config: ConfigService, private readonly security: SessionSecurityService) {}

  async register(payload: RegisterDto, context: RequestContext) {
    const email = payload.email.toLowerCase().trim();
    if (await this.users.findByEmail(email)) throw new ConflictException('Email already registered.');
    const user = await this.users.create({ name: payload.name.trim(), email, passwordHash: await bcrypt.hash(payload.password, 10) });
    return this.issue(user, context);
  }

  async login(payload: LoginDto, context: RequestContext) {
    const user = await this.users.findByEmail(payload.email.toLowerCase().trim());
    if (!user || !await bcrypt.compare(payload.password, user.passwordHash)) throw new UnauthorizedException('Invalid credentials.');
    return this.issue(user, context);
  }

  private matches(token: string, stored: string) {
    // Random refresh secrets are hashed in full; bcrypt truncates at 72 bytes.
    // Old session hashes intentionally require a new login, not a fallback.
    return /^[a-f0-9]{64}$/.test(stored) && timingSafeEqual(Buffer.from(tokenHash(token), 'hex'), Buffer.from(stored, 'hex'));
  }

  async refresh(refreshToken?: string) {
    const session = refreshToken ? await this.prisma.authSession.findUnique({ where: { id: refreshToken.split('.')[0] }, include: { user: true } }) : null;
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !this.matches(refreshToken!, session.refreshTokenHash)) throw new UnauthorizedException('Invalid refresh token.');
    const next = `${session.id}.${randomBytes(64).toString('base64url')}`;
    const accessToken = await this.signAccessToken(session.user, session.id);
    const result = await this.prisma.authSession.updateMany({ where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { refreshTokenHash: tokenHash(next) } });
    if (result.count !== 1) throw new ConflictException('Session renewal already in progress.');
    return { accessToken, refreshToken: next, refreshExpiresAt: session.expiresAt, user: this.users.toSafeUser(session.user) };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      const session = await this.prisma.authSession.findUnique({ where: { id: refreshToken.split('.')[0] } });
      if (session && this.matches(refreshToken, session.refreshTokenHash)) await this.prisma.authSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { message: 'Logged out successfully.' };
  }

  sessionUser(id: string) { return this.users.findSafeById(id); }

  private async issue(user: User, context: RequestContext) {
    const sid = randomUUID(), refreshToken = `${sid}.${randomBytes(64).toString('base64url')}`;
    const refreshExpiresAt = new Date(Date.now() + this.security.refreshMs);
    const accessToken = await this.signAccessToken(user, sid);
    await this.prisma.authSession.create({ data: { id: sid, userId: user.id, refreshTokenHash: tokenHash(refreshToken),
      userAgent: context.userAgent, ipAddress: context.ipAddress, expiresAt: refreshExpiresAt } });
    return { accessToken, refreshToken, refreshExpiresAt, user: this.users.toSafeUser(user) };
  }

  private signAccessToken(user: User, sid: string) {
    return this.jwt.signAsync({ sub: user.id, sid }, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: Math.floor(this.security.accessMs / 1000), algorithm: 'HS256' });
  }
}
