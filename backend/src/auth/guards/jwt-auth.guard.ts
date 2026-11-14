import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionSecurityService } from '../session-security.service';
import { AuthenticatedUser } from '../types/authenticated-user';
import { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService,
    private readonly prisma: PrismaService, private readonly security: SessionSecurityService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const token = this.security.read(request, this.security.accessName);
    if (!token) throw new UnauthorizedException('Missing session.');
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), algorithms: ['HS256'] });
      if (typeof payload.sid !== 'string' || typeof payload.sub !== 'string') throw new Error('Invalid session claims.');
      const session = await this.prisma.authSession.findFirst({ where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
      if (!session) throw new Error('Revoked session.');
      request.user = { id: session.user.id, email: session.user.email, role: session.user.role };
      return true;
    } catch { throw new UnauthorizedException('Invalid or expired session.'); }
  }
}
