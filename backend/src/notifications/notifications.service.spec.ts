import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from './notifications.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('ESB-eu daily reminders', () => {
  const sendMail = jest.fn();
  let service: NotificationsService;
  let database: { user: { findMany: jest.Mock }; esbeuAssessment: { findMany: jest.Mock }; dailyCheckIn: { findUnique: jest.Mock } };
  let profile: { id: string; name: string; email: string; dailyReminder: boolean };
  const tick = () => (service as unknown as { processDailyReminderTick(): Promise<void> }).processDailyReminderTick();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T15:00:00Z'));
    profile = { id: 'fictional', name: 'Teste', email: 'test@example.invalid', dailyReminder: true };
    database = { user: { findMany: jest.fn().mockResolvedValue([profile]) }, esbeuAssessment: { findMany: jest.fn().mockResolvedValue([]) }, dailyCheckIn: { findUnique: jest.fn().mockResolvedValue(null) } };
    const values: Record<string, string> = { DAILY_REMINDER_HOUR: '12', DAILY_REMINDER_MINUTE: '0', DAILY_REMINDER_TIMEZONE: 'America/Sao_Paulo',
      SMTP_HOST: 'smtp.invalid', SMTP_USER: 'test', SMTP_PASS: 'test' };
    service = new NotificationsService(databaseConfig(values), database as unknown as PrismaService,
      { findSafeById: jest.fn().mockResolvedValue(profile) } as unknown as UsersService);
    sendMail.mockReset().mockResolvedValue({ messageId: 'fictional' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });
  afterEach(() => jest.useRealTimers());

  it('uses new assessments and the local day, and avoids duplicate sends in one process', async () => {
    await tick(); await tick();
    expect(database.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dailyReminder: true } }));
    expect(database.esbeuAssessment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: profile.id }) }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].text).toContain('últimas quatro semanas');
  });
  it('skips today even when the UTC date is tomorrow', async () => {
    database.esbeuAssessment.findMany.mockResolvedValue([{ createdAt: new Date('2026-11-04T01:00:00Z') }]);
    await tick(); expect(sendMail).not.toHaveBeenCalled();
  });
  it('does not count yesterday from the same UTC date as a registration today', async () => {
    database.esbeuAssessment.findMany.mockResolvedValue([{ createdAt: new Date('2026-11-03T01:00:00Z') }]);
    await tick(); expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('does not send outside the configured minute', async () => {
    jest.setSystemTime(new Date('2026-11-03T14:59:00Z'));
    await tick(); expect(database.user.findMany).not.toHaveBeenCalled();
  });
  it('skips reminders when today already has a daily check-in', async () => {
    database.dailyCheckIn.findUnique.mockResolvedValue({ id: 'fictional-check-in' });
    await tick(); expect(sendMail).not.toHaveBeenCalled();
    expect(database.esbeuAssessment.findMany).not.toHaveBeenCalled();
  });
  it('allows retry after SMTP fails without marking delivery as sent', async () => {
    sendMail.mockRejectedValueOnce(new Error('fictional SMTP failure'));
    await tick(); await tick(); expect(sendMail).toHaveBeenCalledTimes(2);
  });
  it('test delivery respects saved preferences and does not send a second risk message', async () => {
    profile.dailyReminder = false;
    const result = await service.sendTestNotification({ id: profile.id } as Parameters<NotificationsService['sendTestNotification']>[0], { dailyReminder: true });
    expect(result.dailyReminder.status).toBe('skipped');
    expect(result.emailAlert.status).toBe('skipped');
    expect(sendMail).not.toHaveBeenCalled();
  });
});

function databaseConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}
