import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RiskLevel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { StoredAssessmentIndicators } from '../ai/burnout-feature.mapper';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { TestNotificationDto } from './dto/test-notification.dto';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sentDailyReminderKeys = new Set<string>();
  private dailyReminderInterval?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  onModuleInit() {
    if (this.configService.get<string>('DAILY_REMINDER_ENABLED') === 'false') {
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

  async sendTestNotification(user: AuthenticatedUser, preferences: TestNotificationDto) {
    const profile = await this.usersService.findSafeById(user.id);
    const emailAlerts = preferences.emailAlerts ?? profile.emailAlerts;
    const dailyReminder = preferences.dailyReminder ?? profile.dailyReminder;
    const sampleFactors = ['Estresse acima do ideal', 'Cansaço acumulado', 'Pressão acadêmica elevada'];
    const emailAlert = await this.deliverEmail(
      emailAlerts,
      profile.email,
      'Prévia de alerta preventivo BurnoutSense',
      this.buildRiskAlertText(profile.name, sampleFactors, true),
      this.buildRiskAlertHtml(profile.name, sampleFactors, true),
    );
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
        userId: profile.id,
        email: profile.email,
        emailAlert: emailAlert.status,
        dailyReminder: reminder.status,
      }),
    );

    return {
      deliveryMode: this.isSmtpConfigured() ? 'smtp' : 'not-configured',
      emailAlert,
      dailyReminder: reminder,
      message: this.buildResultMessage(emailAlerts, dailyReminder, emailAlert.status, reminder.status),
    };
  }

  async sendHighRiskAlert(
    userId: string,
    assessment: StoredAssessmentIndicators,
    mainFactors: string[],
    riskLevel: RiskLevel,
  ) {
    if (riskLevel !== RiskLevel.HIGH) {
      return {
        status: 'skipped',
        reason: 'Risk level does not require alert',
      };
    }

    const profile = await this.usersService.findSafeById(userId);

    return this.deliverEmail(
      profile.emailAlerts,
      profile.email,
      'Atenção preventiva: seu registro indicou risco alto',
      this.buildHighRiskText(profile.name, assessment, mainFactors),
      this.buildHighRiskHtml(profile.name, assessment, mainFactors),
    );
  }

  private async processDailyReminderTick() {
    const now = new Date();
    const localParts = getDateTimeParts(now, this.getDailyReminderTimezone());

    if (localParts.hour !== this.getDailyReminderHour() || localParts.minute !== this.getDailyReminderMinute()) {
      return;
    }

    const reminderKey = localParts.dateKey;

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

        const result = await this.deliverEmail(
          true,
          user.email,
          'Seu check-in de bem-estar no BurnoutSense',
          this.buildDailyReminderText(user.name),
          this.buildDailyReminderHtml(user.name),
        );

        this.sentDailyReminderKeys.add(userReminderKey);
        this.logger.log(
          JSON.stringify({
            type: 'daily-reminder',
            userId: user.id,
            email: user.email,
            status: result.status,
            date: localParts.dateKey,
          }),
        );
      }

      this.pruneSentReminderKeys(reminderKey);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          type: 'daily-reminder-failed',
          reason: error instanceof Error ? error.message : 'Unknown reminder scheduler error',
        }),
      );
    }
  }

  private async hasAssessmentOnDate(userId: string, dateKey: string) {
    const start = new Date(`${dateKey}T00:00:00.000Z`);
    const end = new Date(`${dateKey}T23:59:59.999Z`);
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(assessment);
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
          recipient,
          subject,
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

  private buildResultMessage(emailAlerts: boolean, dailyReminder: boolean, emailStatus: string, reminderStatus: string) {
    if (!emailAlerts && !dailyReminder) {
      return 'Nenhuma notificacao ativa para testar.';
    }

    if (emailStatus === 'sent' || reminderStatus === 'sent') {
      return 'E-mail de teste enviado. Verifique a caixa de entrada e o spam.';
    }

    if (emailStatus === 'not_configured' || reminderStatus === 'not_configured') {
      return 'SMTP nao configurado. Preencha as variaveis SMTP no backend para receber e-mails reais.';
    }

    if (emailStatus === 'failed' || reminderStatus === 'failed') {
      return 'Nao foi possivel enviar o e-mail de teste. Verifique a conexao SMTP e as credenciais do provedor.';
    }

    return 'Teste processado.';
  }

  private buildDailyReminderText(name: string) {
    return [
      `Olá, ${firstName(name)}.`,
      '',
      'Este é o seu lembrete gentil para registrar como foi o dia no BurnoutSense.',
      'Leva menos de um minuto e ajuda a transformar sinais soltos da rotina em um acompanhamento mais claro: sono, estresse, carga acadêmica, humor e contexto.',
      '',
      'Não precisa escrever perfeito. Seja honesto com você mesmo hoje.',
      '',
      'Sugestão rápida:',
      '- Como foi sua energia?',
      '- O sono ajudou ou pesou?',
      '- A rotina acadêmica ficou leve, média ou puxada?',
      '- Existe algo que merece atenção amanhã?',
      '',
      'BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.',
    ].join('\n');
  }

  private buildDailyReminderHtml(name: string) {
    return baseEmailTemplate({
      badge: 'Check-in diário',
      title: `Olá, ${escapeHtml(firstName(name))}. Como você chegou até aqui hoje?`,
      intro:
        'Reserve um minuto para registrar seu dia. Pequenos registros consistentes ajudam a perceber padrões de sono, estresse, carga acadêmica e humor antes que tudo fique pesado demais.',
      tone: 'mint',
      sections: [
        {
          title: 'Por que registrar hoje?',
          items: [
            'Acompanhar sua energia e seu descanso com mais clareza.',
            'Perceber quando a pressão acadêmica começa a acumular.',
            'Criar histórico para recomendações preventivas mais úteis.',
          ],
        },
        {
          title: 'Perguntas rápidas',
          items: ['Como foi sua energia?', 'O sono ajudou ou pesou?', 'O que merece atenção amanhã?'],
        },
      ],
      note: 'Não precisa escrever perfeito. Um registro honesto já é um cuidado com sua rotina.',
    });
  }

  private buildRiskAlertText(name: string, factors: string[], isPreview = false) {
    return [
      `Olá, ${firstName(name)}.`,
      '',
      isPreview
        ? 'Esta é uma prévia do alerta preventivo do BurnoutSense.'
        : 'Seu último registro indicou risco alto de sobrecarga acadêmica.',
      'Isso não é um diagnóstico clínico, mas é um sinal importante para pausar, observar a rotina e reduzir a intensidade quando possível.',
      '',
      'Pontos que merecem atenção:',
      ...factors.slice(0, 4).map((factor) => `- ${factor}`),
      '',
      'Próximos passos sugeridos:',
      '- Divida tarefas grandes em blocos menores.',
      '- Priorize sono, pausas e hidratação nas próximas horas.',
      '- Se o desconforto persistir, converse com alguém de confiança ou procure apoio profissional.',
      '',
      'BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.',
    ].join('\n');
  }

  private buildRiskAlertHtml(name: string, factors: string[], isPreview = false) {
    return baseEmailTemplate({
      badge: isPreview ? 'Prévia de alerta' : 'Alerta preventivo',
      title: isPreview ? 'Seu alerta preventivo está pronto para apoiar você.' : 'Seu registro indicou risco alto.',
      intro:
        'O BurnoutSense identificou sinais que merecem atenção. Isso não é um diagnóstico clínico, mas pode ser um bom momento para reduzir a intensidade e reorganizar as próximas horas.',
      tone: 'peach',
      sections: [
        {
          title: 'Pontos observados',
          items: factors.slice(0, 4),
        },
        {
          title: 'Cuidados imediatos sugeridos',
          items: [
            'Divida tarefas grandes em blocos menores e mais possíveis.',
            'Faça uma pausa real antes de retomar atividades intensas.',
            'Priorize sono, alimentação e uma conversa de apoio se o peso persistir.',
          ],
        },
      ],
      note: `Olá, ${escapeHtml(firstName(name))}. O objetivo deste alerta é apoiar sua percepção da rotina, sem julgamento.`,
    });
  }

  private buildHighRiskText(name: string, assessment: StoredAssessmentIndicators, mainFactors: string[]) {
    const factors = mainFactors.length ? mainFactors : ['Indicadores de sobrecarga acima do ideal'];
    return [
      this.buildRiskAlertText(name, factors),
      '',
      'Resumo do registro:',
      `- Sono: ${formatHours(assessment.sleepHours)}`,
      `- Estresse: ${assessment.stressLevel}/10`,
      `- Cansaço: ${assessment.tirednessLevel}/10`,
      `- Pressão acadêmica: ${assessment.examPressure}/10`,
    ].join('\n');
  }

  private buildHighRiskHtml(name: string, assessment: StoredAssessmentIndicators, mainFactors: string[]) {
    const factors = mainFactors.length ? mainFactors : ['Indicadores de sobrecarga acima do ideal'];
    return baseEmailTemplate({
      badge: 'Alerta preventivo',
      title: 'Seu registro indicou risco alto.',
      intro:
        'O BurnoutSense percebeu sinais de sobrecarga no seu acompanhamento mais recente. Use este aviso como um convite para pausar, priorizar o essencial e buscar apoio se necessário.',
      tone: 'peach',
      metrics: [
        { label: 'Sono', value: formatHours(assessment.sleepHours) },
        { label: 'Estresse', value: `${assessment.stressLevel}/10` },
        { label: 'Cansaço', value: `${assessment.tirednessLevel}/10` },
        { label: 'Pressão acadêmica', value: `${assessment.examPressure}/10` },
      ],
      sections: [
        {
          title: 'O que chamou atenção',
          items: factors.slice(0, 4),
        },
        {
          title: 'Ações para agora',
          items: [
            'Escolha apenas uma prioridade para o próximo bloco de estudo.',
            'Reduza estímulos por alguns minutos antes de continuar.',
            'Se esse padrão se repetir, converse com alguém de confiança ou procure apoio profissional.',
          ],
        },
      ],
      note: `Olá, ${escapeHtml(firstName(name))}. Este alerta é preventivo e não substitui acompanhamento médico ou psicológico.`,
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

    if (smtpError.response) {
      return smtpError.response;
    }

    return smtpError.message;
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

function formatHours(hours: number) {
  return `${Number(hours.toFixed(1)).toLocaleString('pt-BR')} ${hours === 1 ? 'hora' : 'horas'}`;
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
