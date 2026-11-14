import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionSecurityService } from './session-security.service';
import { PasswordResetService } from './password-reset.service';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

describe('Password recovery', () => {
  const user = { id: 'fictional', email: 'fictional@example.invalid' };
  const token = 'a'.repeat(64);
  let service: PasswordResetService;
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: { updateMany: jest.fn(), createMany: jest.fn(), findUnique: jest.fn() },
    authSession: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const mail = { sendPasswordReset: jest.fn(), sendPasswordChanged: jest.fn() };
  const flush = () => Promise.all([...(service as unknown as { pending: Map<string, Promise<void>> }).pending.values()]);
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({});
    prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.createMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.findUnique.mockResolvedValue({ userId: user.id, usedAt: null, expiresAt: new Date(Date.now() + 60000) });
    prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
    mail.sendPasswordReset.mockResolvedValue({ status: 'sent' });
    mail.sendPasswordChanged.mockResolvedValue({ status: 'sent' });
    service = new PasswordResetService(prisma as unknown as PrismaService, mail as unknown as NotificationsService,
      { origin: 'https://burnoutsense.online' } as SessionSecurityService);
  });
  it('responds before account lookup and returns the same message for unknown accounts', async () => {
    const known = service.request(user.email);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(known).not.toHaveProperty('token');
    await flush();
    prisma.user.findUnique.mockResolvedValue(null);
    expect(service.request('unknown@example.invalid')).toEqual(known);
    await flush();
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
  });
  it('normalizes email, stores only a digest and sends a trusted fragment link', async () => {
    service.request('  FICTIONAL@EXAMPLE.INVALID  '); await flush();
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: user.email } }));
    const url = new URL(mail.sendPasswordReset.mock.calls[0][1]);
    expect(url.origin).toBe('https://burnoutsense.online');
    expect(url.pathname).toBe('/redefinir-senha'); expect(url.search).toBe('');
    const secret = new URLSearchParams(url.hash.slice(1)).get('token')!;
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    const stored = prisma.passwordResetToken.updateMany.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(createHash('sha256').update(secret).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(30 * 60_000);
  });
  it('claims a new account token without overwriting a concurrent claim', async () => {
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    service.request(user.email); await flush();
    expect(prisma.passwordResetToken.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
  });
  it('honors the per-account cooldown and deduplicates queued requests', async () => {
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.createMany.mockResolvedValue({ count: 0 });
    service.request(user.email); service.request(user.email); await flush();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.updateMany.mock.calls[0][0].where.createdAt.lte.getTime()).toBeLessThanOrEqual(Date.now() - 60000);
  });
  it.each(['missing', 'used', 'expired'])('rejects a %s token without changing a password', async state => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(state === 'missing' ? null : {
      userId: user.id, usedAt: state === 'used' ? new Date() : null, expiresAt: new Date(state === 'expired' ? 0 : Date.now() + 60000),
    });
    await expect(service.reset(token, 'NewTest123')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('atomically consumes the token, hashes the password and revokes every session', async () => {
    await service.reset(token, 'NewTest123');
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usedAt: null, tokenHash: createHash('sha256').update(token).digest('hex') }) }));
    const hashed = prisma.user.update.mock.calls[0][0].data.passwordHash;
    expect(await bcrypt.compare('NewTest123', hashed)).toBe(true);
    expect(bcrypt.getRounds(hashed)).toBe(10);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id, revokedAt: null } }));
    expect(mail.sendPasswordChanged).toHaveBeenCalledWith(user.id);
  });
  it('does not update password or sessions if another request consumed the link first', async () => {
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reset(token, 'NewTest123')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled(); expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });
  it('enforces token shape and the same password requirements as registration', async () => {
    for (const password of ['short', 'onlylowercase1', 'ONLYUPPERCASE1', 'NoNumberHere', 'A1a'.repeat(25)]) {
      expect((await validate(Object.assign(new ResetPasswordDto(), { token, password }))).length).toBeGreaterThan(0);
    }
    expect(await validate(Object.assign(new ResetPasswordDto(), { token, password: 'NewTest123' }))).toHaveLength(0);
    expect((await validate(Object.assign(new ResetPasswordDto(), { token: 'invalid', password: 'NewTest123' }))).length).toBeGreaterThan(0);
    expect((await validate(Object.assign(new ForgotPasswordDto(), { email: 'invalid' }))).length).toBeGreaterThan(0);
  });
});
