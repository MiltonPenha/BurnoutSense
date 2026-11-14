import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionSecurityService } from '../session-security.service';

describe('Access tokens require a live server session', () => {
  const config = new ConfigService({ JWT_ACCESS_SECRET: 'test-secret' });
  const jwt = { verifyAsync: jest.fn() }, sessions = { findFirst: jest.fn() };
  const guard = new JwtAuthGuard(jwt as unknown as JwtService, config, { authSession: sessions } as unknown as PrismaService, new SessionSecurityService(config));
  const context = (req: object) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;
  it('does not accept bearer-only legacy clients', async () => {
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer legacy' }, cookies: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('refuses old JWTs without sid and revoked server sessions', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user' });
    await expect(guard.canActivate(context({ cookies: { bs_access: 'test-token' } }))).rejects.toBeInstanceOf(UnauthorizedException);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user', sid: 'session' }); sessions.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(context({ cookies: { bs_access: 'test-token' } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('uses the current database identity, not role claims from a stale JWT', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user', sid: 'session' });
    sessions.findFirst.mockResolvedValue({ user: { id: 'user', email: 'fake@example.invalid', role: 'STUDENT' } });
    const req = { cookies: { bs_access: 'test-token' }, user: undefined };
    expect(await guard.canActivate(context(req))).toBe(true);
    expect(req.user).toEqual({ id: 'user', email: 'fake@example.invalid', role: 'STUDENT' });
  });
});
