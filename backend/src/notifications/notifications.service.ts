import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { TestNotificationDto } from './dto/test-notification.dto';
import { utcDay } from '../daily-check-ins/calendar-day';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sentDailyReminderKeys = new Set<string>();
  private dailyReminderInterval?: NodeJS.Timeout;
  private processingReminders = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  onModuleInit() {
    if (this.configService.get<string>('DAILY_REMINDER_ENABLED') !== 'true') {
      this.logger.log('Daily reminder scheduler disabled.');
      return;
    }

    this.dailyReminderInterval = setInterval(() => {
      void this.processDailyReminderTick();
    }, 60_000);

    this.logger.log(
      `Daily reminder scheduler enabled for ${this.getDailyReminderTime()} (${this.getDailyReminderTimezone()}).`,
    );
    void this.processDailyReminderTick();
  }

  onModuleDestroy() {
    if (this.dailyReminderInterval) {
      clearInterval(this.dailyReminderInterval);
    }
  }

  async sendTestNotification(user: AuthenticatedUser, _preferences: TestNotificationDto) {
    const profile = await this.usersService.findSafeById(user.id);
    const dailyReminder = profile.dailyReminder;
    const reminder = await this.deliverEmail(
      dailyReminder,
      profile.email,
      'Seu check-in de bem-estar no BurnoutSense',
      this.buildDailyReminderText(profile.name),
      this.buildDailyReminderHtml(profile.name),
    );

    this.logger.log(
      JSON.stringify({
        type: 'notification-test',
        dailyReminder: reminder.status,
      }),
    );

    return {
      deliveryMode: this.isSmtpConfigured() ? 'smtp' : 'not-configured',
      dailyReminder: reminder,
      message: this.buildResultMessage(dailyReminder, reminder.status),
    };
  }

  private async processDailyReminderTick() {
    if (this.processingReminders) return;
    const now = new Date();
    const localParts = getDateTimeParts(now, this.getDailyReminderTimezone());

    const elapsed = localParts.hour * 60 + localParts.minute - (this.getDailyReminderHour() * 60 + this.getDailyReminderMinute());
    if (elapsed < 0 || elapsed > 10) {
      return;
    }

    const reminderKey = localParts.dateKey;
    this.processingReminders = true;

    try {
      const users = await this.prisma.user.findMany({
        where: {
          dailyReminder: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      for (const user of users) {
        const userReminderKey = `${reminderKey}:${user.id}`;

        if (this.sentDailyReminderKeys.has(userReminderKey)) {
          continue;
        }

        const alreadyRegistered = await this.hasAssessmentOnDate(user.id, localParts.dateKey);

        if (alreadyRegistered) {
          this.sentDailyReminderKeys.add(userReminderKey);
          continue;
        }

        const date = utcDay(reminderKey);
        const where = { userId_date: { userId: user.id, date } };
        await this.prisma.dailyReminderDelivery.upsert({ where, create: { userId: user.id, date }, update: {} });
        const claim = await this.prisma.dailyReminderDelivery.updateMany({
          where: { userId: user.id, date, sentAt: null, attempts: { lt: 3 },
            AND: [{ OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }] },
              { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }] },
          data: { claimedAt: now, nextAttemptAt: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
        });
        if (!claim.count) continue;
        const preference = await this.prisma.user.findUnique({ where: { id: user.id }, select: { dailyReminder: true } });
        if (!preference?.dailyReminder || await this.hasAssessmentOnDate(user.id, reminderKey)) {
          await this.prisma.dailyReminderDelivery.update({ where, data: { claimedAt: null } });
          continue;
        }
        const result = await this.deliverEmail(
          true,
          user.email,
          'Seu check-in de bem-estar no BurnoutSense',
          this.buildDailyReminderText(user.name),
          this.buildDailyReminderHtml(user.name),
        );

        await this.prisma.dailyReminderDelivery.update({ where, data: { claimedAt: null, ...(result.status === 'sent' ? { sentAt: new Date() } : {}) } });
        if (result.status === 'sent') this.sentDailyReminderKeys.add(userReminderKey);
        this.logger.log(
          JSON.stringify({
            type: 'daily-reminder',
            status: result.status,
            date: localParts.dateKey,
          }),
        );
      }

      this.pruneSentReminderKeys(reminderKey);
    } catch {
      this.logger.warn(
        JSON.stringify({
          type: 'daily-reminder-failed',
          reason: 'Falha ao processar os lembretes.',
        }),
      );
    } finally {
      this.processingReminders = false;
    }
  }

  private async hasAssessmentOnDate(userId: string, dateKey: string) {
    return Boolean(await this.prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: utcDay(dateKey) } }, select: { id: true } }));
  }

  private async deliverEmail(enabled: boolean, recipient: string, subject: string, text: string, html?: string) {
    if (!enabled) {
      return {
        status: 'skipped',
        reason: 'Preference disabled',
      };
    }

    if (!this.isSmtpConfigured()) {
      return {
        status: 'not_configured',
        recipient,
        subject,
        reason: 'SMTP settings are missing.',
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: this.configService.getOrThrow<string>('SMTP_HOST'),
        port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: this.configService.getOrThrow<string>('SMTP_USER'),
          pass: this.configService.getOrThrow<string>('SMTP_PASS'),
        },
      });

      const result = await transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM') ?? this.configService.getOrThrow<string>('SMTP_USER'),
        to: recipient,
        subject,
        text,
        html: html ?? `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
      });

      return {
        status: 'sent',
        recipient,
        subject,
        messageId: result.messageId,
      };
    } catch (error) {
      const reason = this.describeSmtpError(error);
      this.logger.warn(
        JSON.stringify({
          type: 'notification-delivery-failed',
          reason,
        }),
      );

      return {
        status: 'failed',
        recipient,
        subject,
        reason,
      };
    }
  }

  private isSmtpConfigured() {
    return Boolean(
      this.configService.get<string>('SMTP_HOST') &&
        this.configService.get<string>('SMTP_USER') &&
        this.configService.get<string>('SMTP_PASS'),
    );
  }

  private buildResultMessage(dailyReminder: boolean, reminderStatus: string) {
    if (!dailyReminder) {
      return 'Ative e salve o lembrete diário antes de testar.';
    }

    if (reminderStatus === 'sent') {
      return 'E-mail de teste enviado. Verifique a caixa de entrada e o spam.';
    }

    if (reminderStatus === 'not_configured') {
      return 'SMTP não configurado. Confira as variáveis SMTP no backend.';
    }

    if (reminderStatus === 'failed') {
      return 'Não foi possível enviar o lembrete de teste. Confira a conexão SMTP e as credenciais.';
    }

    return 'Teste processado.';
  }

  private buildDailyReminderText(name: string) {
    return [
      `Olá, ${firstName(name)}.`,
      '',
      'Que tal reservar um momento para acompanhar sua rotina no BurnoutSense?',
      'Registre como foi seu dia: sono, demandas dos estudos, descanso e apoio. Um registro breve já ajuda a acompanhar sua rotina.',
      '',
      'A porcentagem exibida é uma posição na escala ESB-eu, não uma probabilidade de burnout ou diagnóstico.',
      '',
      'Sugestão rápida:',
      '- Como têm sido seu descanso e as demandas acadêmicas?',
      '- Você tem conseguido contar com apoio?',
      '- O que gostaria de conversar com alguém de confiança?',
      '',
      'BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.',
    ].join('\n');
  }

  private buildDailyReminderHtml(name: string) {
    return baseEmailTemplate({
      badge: 'Check-in diário',
      title: `Olá, ${firstName(name)}. Um momento para cuidar da sua rotina?`,
      intro:
        'Reserve um momento para contar como foi seu dia. Sono, demandas, descanso e apoio ajudam a acompanhar sua rotina.',
      tone: 'mint',
      sections: [
        {
          title: 'Por que registrar hoje?',
          items: [
            'Acompanhar sua energia e seu descanso com mais clareza.',
            'Perceber quando a pressão acadêmica começa a acumular.',
            'Construir um histórico dos seus indicadores acadêmicos.',
          ],
        },
        {
          title: 'Perguntas rápidas',
          items: ['Como foi sua energia?', 'O sono ajudou ou pesou?', 'O que merece atenção amanhã?'],
        },
      ],
      note: 'O índice é uma posição na escala ESB-eu. Não indica probabilidade de burnout e não substitui avaliação profissional.',
    });
  }

  private getDailyReminderHour() {
    return clampScheduleNumber(this.configService.get<string>('DAILY_REMINDER_HOUR'), 12, 0, 23);
  }

  private getDailyReminderMinute() {
    return clampScheduleNumber(this.configService.get<string>('DAILY_REMINDER_MINUTE'), 0, 0, 59);
  }

  private getDailyReminderTime() {
    return `${String(this.getDailyReminderHour()).padStart(2, '0')}:${String(this.getDailyReminderMinute()).padStart(2, '0')}`;
  }

  private getDailyReminderTimezone() {
    return this.configService.get<string>('DAILY_REMINDER_TIMEZONE') ?? 'America/Sao_Paulo';
  }

  private pruneSentReminderKeys(currentDateKey: string) {
    for (const key of this.sentDailyReminderKeys) {
      if (!key.startsWith(`${currentDateKey}:`)) {
        this.sentDailyReminderKeys.delete(key);
      }
    }
  }

  private describeSmtpError(error: unknown) {
    if (!(error instanceof Error)) {
      return 'Erro SMTP desconhecido.';
    }

    const smtpError = error as Error & {
      code?: string;
      command?: string;
      response?: string;
      responseCode?: number;
    };

    if (smtpError.code === 'EAUTH' || smtpError.responseCode === 535) {
      return 'Falha de autenticacao SMTP. Confira usuario e senha de app.';
    }

    if (smtpError.code === 'ESOCKET') {
      return 'Falha de conexao SMTP. A rede pode estar bloqueando a porta do provedor.';
    }

    return 'Não foi possível concluir o envio pelo provedor SMTP.';
  }
}

interface EmailMetric {
  label: string;
  value: string;
}

interface EmailSection {
  title: string;
  items: string[];
}

interface BaseEmailTemplateOptions {
  badge: string;
  title: string;
  intro: string;
  tone: 'mint' | 'peach';
  metrics?: EmailMetric[];
  sections: EmailSection[];
  note: string;
}

function baseEmailTemplate({ badge, title, intro, tone, metrics = [], sections, note }: BaseEmailTemplateOptions) {
  const accent = tone === 'mint' ? '#34D399' : '#FDBA74';
  const soft = tone === 'mint' ? '#ECFDF5' : '#FFF7ED';
  const border = tone === 'mint' ? '#A7F3D0' : '#FED7AA';

  return `
    <div style="margin:0;padding:28px;background:#F8FAFC;font-family:Arial,Helvetica,sans-serif;color:#0F172A;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#FFFFFF;border:1px solid #DBEAFE;border-radius:22px;overflow:hidden;">
        <tr>
          <td style="padding:28px 30px;background:linear-gradient(135deg,#EFF6FF 0%,${soft} 100%);">
            <span style="display:inline-block;padding:7px 12px;border-radius:999px;background:#FFFFFF;border:1px solid ${border};color:#0F4C81;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(badge)}</span>
            <h1 style="margin:18px 0 10px;font-size:26px;line-height:1.2;color:#082F49;">${escapeHtml(title)}</h1>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">${escapeHtml(intro)}</p>
          </td>
        </tr>
        ${
          metrics.length
            ? `<tr><td style="padding:22px 30px 4px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${metrics
                .map(
                  (metric) => `
                    <td style="padding:10px;width:${100 / metrics.length}%;">
                      <div style="padding:14px;border-radius:16px;background:#F8FAFC;border:1px solid #E2E8F0;">
                        <div style="font-size:12px;color:#64748B;">${escapeHtml(metric.label)}</div>
                        <div style="margin-top:4px;font-size:20px;font-weight:800;color:#082F49;">${escapeHtml(metric.value)}</div>
                      </div>
                    </td>
                  `,
                )
                .join('')}</tr></table></td></tr>`
            : ''
        }
        <tr>
          <td style="padding:22px 30px 8px;">
            ${sections
              .map(
                (section) => `
                  <div style="margin-bottom:20px;">
                    <h2 style="margin:0 0 10px;font-size:16px;color:#082F49;">${escapeHtml(section.title)}</h2>
                    <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.7;">
                      ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                  </div>
                `,
              )
              .join('')}
            <div style="margin-top:18px;padding:16px 18px;border-left:4px solid ${accent};border-radius:14px;background:${soft};color:#334155;font-size:14px;line-height:1.6;">
              ${escapeHtml(note)}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 30px 26px;color:#64748B;font-size:12px;line-height:1.6;border-top:1px solid #E2E8F0;">
            BurnoutSense é uma ferramenta de apoio preventivo ao estudante. Esta mensagem não substitui orientação médica ou psicológica.
          </td>
        </tr>
      </table>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'estudante';
}

function clampScheduleNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsedValue));
}

function getDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';

  return {
    dateKey: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    hour: Number(getPart('hour')),
    minute: Number(getPart('minute')),
  };
}
