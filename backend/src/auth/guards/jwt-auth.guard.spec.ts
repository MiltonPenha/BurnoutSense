import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionSecurityService } from '../session-security.service';
import { SESSION_PROFILE } from '../decorators/session-profile.decorator';

describe('Access tokens require a live server session', () => {
  const config = new ConfigService({ JWT_ACCESS_SECRET: 'test-secret' });
  const jwt = { verifyAsync: jest.fn() }, users = { findFirst: jest.fn() };
  const reflector = new Reflector();
  const handler = () => {};
  const guard = new JwtAuthGuard(jwt as unknown as JwtService, config, { user: users } as unknown as PrismaService, new SessionSecurityService(config), reflector);
  const context = (req: object) => ({ getHandler: () => handler, switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
  beforeEach(() => { jest.clearAllMocks(); Reflect.deleteMetadata(SESSION_PROFILE, handler); });
  it('does not accept bearer-only legacy clients', async () => {
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer legacy' }, cookies: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('refuses old JWTs without sid and revoked server sessions', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user' });
    await expect(guard.canActivate(context({ cookies: { bs_access: 'test-token' } }))).rejects.toBeInstanceOf(UnauthorizedException);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user', sid: 'session' }); users.findFirst.mockResolvedValue(null);
    await expect(guard.canActivate(context({ cookies: { bs_access: 'test-token' } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('uses the current database identity, not role claims from a stale JWT', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user', sid: 'session' });
    users.findFirst.mockResolvedValue({ id: 'user', email: 'fake@example.invalid', role: 'STUDENT' });
    const req = { cookies: { bs_access: 'test-token' }, user: undefined };
    expect(await guard.canActivate(context(req))).toBe(true);
    expect(req.user).toEqual({ id: 'user', email: 'fake@example.invalid', role: 'STUDENT' });
    expect(users.findFirst).toHaveBeenCalledWith({ where: { id: 'user', sessions: { some: {
      id: 'session', revokedAt: null, expiresAt: { gt: expect.any(Date) },
    } } }, select: { id: true, email: true, role: true } });
  });
  it('selects a safe profile only for marked routes, without password or refresh hashes', async () => {
    Reflect.defineMetadata(SESSION_PROFILE, true, handler);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user', sid: 'session' });
    const profile = { id: 'user', email: 'fake@example.invalid', role: 'STUDENT', name: 'Fictitious' };
    users.findFirst.mockResolvedValue(profile);
    const req = { cookies: { bs_access: 'test-token' }, user: undefined };
    await guard.canActivate(context(req));
    expect(req.user).toEqual({ id: profile.id, email: profile.email, role: profile.role, profile });
    expect(users.findFirst.mock.calls[0][0].select).not.toHaveProperty('passwordHash');
    expect(users.findFirst.mock.calls[0][0].select).toHaveProperty('avatarUrl', true);
  });
  it('only skips anonymous renewal when neither credential cookie exists', async () => {
    await expect(guard.canActivate(context({ cookies: {} }))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SESSION_ABSENT' }) });
    await expect(guard.canActivate(context({ cookies: { bs_refresh: 'existing' } }))).rejects.not.toMatchObject({ response: expect.objectContaining({ code: 'SESSION_ABSENT' }) });
  });
});
