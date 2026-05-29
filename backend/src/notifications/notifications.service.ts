import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UsersService } from '../users/users.service';
import { TestNotificationDto } from './dto/test-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async sendTestNotification(user: AuthenticatedUser, preferences: TestNotificationDto) {
    const profile = await this.usersService.findSafeById(user.id);
    const emailAlerts = preferences.emailAlerts ?? profile.emailAlerts;
    const dailyReminder = preferences.dailyReminder ?? profile.dailyReminder;
    const emailAlert = await this.deliverEmail(
      emailAlerts,
      profile.email,
      'Alerta preventivo BurnoutSense',
      'Seu teste de alerta preventivo foi enviado pelo BurnoutSense.',
    );
    const reminder = await this.deliverEmail(
      dailyReminder,
      profile.email,
      'Lembrete diario BurnoutSense',
      'Este e um teste de lembrete diario para registrar seu acompanhamento no BurnoutSense.',
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

  private async deliverEmail(enabled: boolean, recipient: string, subject: string, text: string) {
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
      html: `<p>${text}</p>`,
    });

    return {
      status: 'sent',
      recipient,
      subject,
      messageId: result.messageId,
    };
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

    return 'Teste processado.';
  }
}
