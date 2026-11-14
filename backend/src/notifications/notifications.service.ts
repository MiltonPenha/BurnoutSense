import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { utcDay } from '../daily-check-ins/calendar-day';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private dailyReminderInterval?: NodeJS.Timeout;
  private processingReminders = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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

  async sendPasswordReset(recipient: string, resetUrl: string) {
    const text = [
      'Recebemos um pedido para redefinir sua senha do BurnoutSense.',
      'Abra o link abaixo e escolha uma nova senha. O link vale por 30 minutos e pode ser usado uma única vez.',
      resetUrl,
      'Se você não fez este pedido, ignore esta mensagem. Sua senha continua a mesma.',
      'Nunca compartilhe este link nem sua senha.',
    ].join('\n\n');
    const html = baseEmailTemplate({ badge: 'Segurança da conta', title: 'Vamos recuperar seu acesso?',
      intro: 'Recebemos um pedido para redefinir a senha da sua conta no BurnoutSense.', tone: 'mint',
      sections: [{ title: 'Um novo começo para seu acesso', items: ['O link vale por 30 minutos e funciona uma única vez.', 'Ao concluir, entre com sua nova senha. Suas sessões anteriores serão encerradas.'] }],
      note: 'Não pediu uma nova senha? Ignore esta mensagem. Nenhuma alteração será feita sem a confirmação pelo link.',
      action: { label: 'Redefinir minha senha', url: resetUrl },
    });
    return this.deliverEmail(recipient, 'Redefina sua senha do BurnoutSense', text, html);
  }

  async sendPasswordChanged(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;
    return this.deliverEmail(user.email, 'Sua senha do BurnoutSense foi alterada',
      'Sua senha do BurnoutSense foi redefinida. As sessões anteriores foram encerradas. Se não foi você, solicite uma nova recuperação pelo site e confira a segurança do seu e-mail.',
      baseEmailTemplate({ badge: 'Segurança da conta', title: 'Sua senha foi atualizada',
        intro: 'A redefinição da sua senha foi concluída. Suas sessões anteriores foram encerradas.', tone: 'mint',
        sections: [], note: 'Não reconhece esta alteração? Acesse o site por um endereço conhecido, solicite uma nova recuperação e proteja sua caixa de e-mail.',
      }));
  }

  private async processDailyReminderTick() {
    if (this.processingReminders) return;
    const reminderKey = this.activeReminderDate(new Date());
    if (!reminderKey) return;

    this.processingReminders = true;
    try {
      const date = utcDay(reminderKey);
      const eligible = { dailyReminder: true, dailyCheckIns: { none: { date } } };
      const users = await this.prisma.user.findMany({
        where: eligible,
        select: { id: true, name: true, email: true },
      });

      for (const user of users) {
        const now = new Date();
        if (this.activeReminderDate(now) !== reminderKey) break;
        try {
          const where = { userId: user.id, date };
          await this.prisma.dailyReminderDelivery.createMany({ data: where, skipDuplicates: true });

          // The guarded write is the last eligibility read before SMTP. Once
          // recorded, a crash or ambiguous response cannot authorize a resend.
          const startedAt = new Date();
          if (this.activeReminderDate(startedAt) !== reminderKey) break;
          const claim = await this.prisma.dailyReminderDelivery.updateMany({
            where: {
              ...where,
              user: { ...eligible, email: user.email },
              sentAt: null,
              submissionStartedAt: null,
              attempts: { lt: 3 },
              OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: startedAt } }],
            },
            data: {
              submissionStartedAt: startedAt,
              nextAttemptAt: new Date(startedAt.getTime() + 60_000),
              attempts: { increment: 1 },
            },
          });
          if (!claim.count) continue;

          const result = await this.deliverEmail(
            user.email,
            'Seu check-in de bem-estar no BurnoutSense',
            this.buildDailyReminderText(user.name),
            this.buildDailyReminderHtml(user.name),
          );

          if (result.status === 'sent') {
            await this.prisma.dailyReminderDelivery.update({
              where: { userId_date: where },
              data: { sentAt: new Date() },
            });
          } else if (result.safeToRetry) {
            await this.prisma.dailyReminderDelivery.update({
              where: { userId_date: where },
              data: { submissionStartedAt: null },
            });
          }
          this.logger.log(JSON.stringify({
            type: 'daily-reminder',
            status: result.status === 'failed' && !result.safeToRetry ? 'unknown' : result.status,
            date: reminderKey,
          }));
        } catch {
          this.logReminderFailure();
        }
      }
    } catch {
      this.logReminderFailure();
    } finally {
      this.processingReminders = false;
    }
  }

  private activeReminderDate(now: Date) {
    const local = getDateTimeParts(now, this.getDailyReminderTimezone());
    const elapsed = local.hour * 60 + local.minute - (this.getDailyReminderHour() * 60 + this.getDailyReminderMinute());
    return elapsed >= 0 && elapsed <= 10 ? local.dateKey : null;
  }

  private logReminderFailure() {
    this.logger.warn(JSON.stringify({
      type: 'daily-reminder-failed',
      reason: 'Falha no processamento ou na confirmação do lembrete.',
    }));
  }

  private async deliverEmail(recipient: string, subject: string, text: string, html?: string) {
    if (!this.isSmtpConfigured()) {
      return {
        status: 'not_configured',
        safeToRetry: true,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: this.configService.getOrThrow<string>('SMTP_HOST'),
        port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        auth: {
          user: this.configService.getOrThrow<string>('SMTP_USER'),
          pass: this.configService.getOrThrow<string>('SMTP_PASS'),
        },
      });

      await transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM') ?? this.configService.getOrThrow<string>('SMTP_USER'),
        to: recipient,
        subject,
        text,
        html: html ?? `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
      });

      return {
        status: 'sent',
        safeToRetry: false,
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
        safeToRetry: isTemporarySmtpRejection(error),
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
  action?: { label: string; url: string };
}

function baseEmailTemplate({ badge, title, intro, tone, metrics = [], sections, note, action }: BaseEmailTemplateOptions) {
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
            ${action ? `<p style="margin:0 0 24px;"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 22px;background:#2563EB;color:#FFFFFF;border-radius:8px;text-decoration:none;font-weight:700;">${escapeHtml(action.label)}</a></p>` : ''}
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

function isTemporarySmtpRejection(error: unknown) {
  if (!(error instanceof Error)) return false;
  const { responseCode, command } = error as Error & { responseCode?: number; command?: string };
  return typeof responseCode === 'number' && responseCode >= 400 && responseCode < 500 &&
    (command === 'DATA' || command === 'MAIL FROM' || command === 'RCPT TO');
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
