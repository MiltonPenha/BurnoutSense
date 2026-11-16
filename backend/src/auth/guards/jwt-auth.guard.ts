import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionSecurityService } from '../session-security.service';
import { AuthenticatedUser } from '../types/authenticated-user';
import { JwtPayload } from '../types/jwt-payload';
import { SESSION_PROFILE } from '../decorators/session-profile.decorator';
import { safeUserSelect, SafeUser } from '../../users/safe-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService,
    private readonly prisma: PrismaService, private readonly security: SessionSecurityService,
    private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const token = this.security.read(request, this.security.accessName);
    if (!token) throw new UnauthorizedException({ message: 'Missing session.',
      ...(!this.security.read(request, this.security.refreshName) ? { code: 'SESSION_ABSENT' } : {}) });
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), algorithms: ['HS256'] });
      if (typeof payload.sid !== 'string' || typeof payload.sub !== 'string') throw new Error('Invalid session claims.');
      const withProfile = this.reflector.get<boolean>(SESSION_PROFILE, context.getHandler());
      // A relational filter validates revocation and identity in one database round trip.
      const user = await this.prisma.user.findFirst({ where: { id: payload.sub,
        sessions: { some: { id: payload.sid, revokedAt: null, expiresAt: { gt: new Date() } } } },
        select: withProfile ? safeUserSelect : { id: true, email: true, role: true } });
      if (!user) throw new Error('Revoked session.');
      request.user = { id: user.id, email: user.email, role: user.role,
        ...(withProfile ? { profile: user as SafeUser } : {}) };
      return true;
    } catch { throw new UnauthorizedException('Invalid or expired session.'); }
  }
}
