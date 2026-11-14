import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SessionSecurityService } from './session-security.service';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
describe('Revocable cookie sessions', () => {
  let service: AuthService, passwordHash: string;
  let user: User;
  const token = 'session.' + 'a'.repeat(85);
  let sessions: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  let users: { findByEmail: jest.Mock; create: jest.Mock; toSafeUser: jest.Mock };
  const jwt = { signAsync: jest.fn().mockResolvedValue('server-only-test-access') };
  beforeAll(async () => { passwordHash = await bcrypt.hash('TestPassword1', 10); });
  beforeEach(() => {
    user = { id: 'user', name: 'Fictional', email: 'test@example.invalid', passwordHash } as User;
    sessions = { create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue({ id: 'session', user, refreshTokenHash: hash(token), expiresAt: new Date(Date.now() + 60000), revokedAt: null }) };
    users = { findByEmail: jest.fn().mockResolvedValue(user), create: jest.fn().mockResolvedValue(user), toSafeUser: jest.fn().mockReturnValue({ id: user.id }) };
    const config = new ConfigService({ JWT_ACCESS_SECRET: 'unit-test-secret', FRONTEND_URL: 'http://localhost:3000' });
    service = new AuthService({ authSession: sessions } as unknown as PrismaService, users as unknown as UsersService,
      jwt as unknown as JwtService, config, new SessionSecurityService(config));
  });
  it('keeps password hashing separate and stores only a full refresh digest', async () => {
    const auth = await service.login({ email: user.email, password: 'TestPassword1' }, {});
    const data = sessions.create.mock.calls[0][0].data;
    expect(data.refreshTokenHash).toBe(hash(auth.refreshToken));
    expect(data.refreshTokenHash).not.toBe(auth.refreshToken);
    expect(jwt.signAsync).toHaveBeenLastCalledWith({ sub: user.id, sid: data.id }, expect.objectContaining({ algorithm: 'HS256' }));
  });
  it('rejects incorrect passwords', async () => {
    await expect(service.login({ email: user.email, password: 'incorrect' }, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it('atomically consumes the current refresh revision without extending its absolute expiry', async () => {
    const result = await service.refresh(token);
    expect(result.refreshToken).not.toBe(token);
    expect(sessions.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'session', refreshTokenHash: hash(token), revokedAt: null }), data: { refreshTokenHash: hash(result.refreshToken) } });
    expect(sessions.updateMany.mock.calls[0][0].data.expiresAt).toBeUndefined();
    sessions.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.refresh(token)).rejects.toBeInstanceOf(ConflictException);
  });
  it('validates bytes beyond bcrypt truncation and refuses legacy session hashes', async () => {
    await expect(service.refresh(token.slice(0, -1) + 'b')).rejects.toBeInstanceOf(UnauthorizedException);
    sessions.findUnique.mockResolvedValue({ id: 'session', user, refreshTokenHash: passwordHash, expiresAt: new Date(Date.now() + 60000) });
    await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('logout works without a valid access token and revokes only the matching refresh session', async () => {
    await service.logout(token);
    expect(sessions.updateMany).toHaveBeenCalledWith({ where: { id: 'session', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    sessions.updateMany.mockClear(); await service.logout(token + 'wrong');
    expect(sessions.updateMany).not.toHaveBeenCalled();
  });
});
