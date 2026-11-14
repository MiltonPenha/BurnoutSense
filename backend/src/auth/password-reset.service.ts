import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionSecurityService } from './session-security.service';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const invalidLink = () => new BadRequestException('Este link é inválido ou expirou. Solicite um novo link.');

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService, private readonly mail: NotificationsService,
    private readonly security: SessionSecurityService) {}

  request(email: string) {
    const normalized = email.toLowerCase().trim();
    // Account lookup and SMTP never delay the public response or reveal membership.
    if (!this.pending.has(normalized) && this.pending.size < 100) {
      const job = new Promise<void>(resolve => setImmediate(resolve))
        .then(() => this.deliverLink(normalized))
        .catch(() => { this.logger.warn('Password recovery could not be processed.'); })
        .finally(() => { this.pending.delete(normalized); });
      this.pending.set(normalized, job);
    }
    return { message: 'Se houver uma conta com este e-mail, você receberá um link para redefinir sua senha.' };
  }

  private async deliverLink(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) return;
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const data = { tokenHash: digest(token), expiresAt: new Date(now.getTime() + 30 * 60_000), usedAt: null, createdAt: now };
    // A per-account atomic cooldown also works across multiple API instances.
    const updated = await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, createdAt: { lte: new Date(now.getTime() - 60_000) } }, data,
    });
    const claimed = updated.count || (await this.prisma.passwordResetToken.createMany({ data: { userId: user.id, ...data }, skipDuplicates: true })).count;
    if (!claimed) return;
    const url = new URL('/redefinir-senha', this.security.origin);
    // A fragment is not included in HTTP requests or referrer headers.
    url.hash = new URLSearchParams({ token }).toString();
    await this.mail.sendPasswordReset(user.email, url.toString());
  }

  async reset(token: string, password: string) {
    const tokenHash = digest(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw invalidLink();
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async tx => {
      const now = new Date();
      const claimed = await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (claimed.count !== 1) throw invalidLink();
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.authSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
    });
    void this.mail.sendPasswordChanged(record.userId).catch(() => { this.logger.warn('Password change confirmation could not be sent.'); });
    return { message: 'Senha redefinida. Entre na sua conta com a nova senha.' };
  }
}
