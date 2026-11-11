import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from './notifications.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('ESB-eu daily reminders', () => {
  const sendMail = jest.fn();
  let service: NotificationsService;
  let database: { user: { findMany: jest.Mock; findUnique: jest.Mock }; dailyReminderDelivery: { upsert: jest.Mock; updateMany: jest.Mock; update: jest.Mock }; dailyCheckIn: { findUnique: jest.Mock } };
  let settings: ConfigService;
  let profile: { id: string; name: string; email: string; dailyReminder: boolean };
  const tick = () => (service as unknown as { processDailyReminderTick(): Promise<void> }).processDailyReminderTick();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T15:00:00Z'));
    profile = { id: 'fictional', name: 'Teste', email: 'test@example.invalid', dailyReminder: true };
    let sent = false, attempts = 0, nextAttempt = 0;
    database = { user: { findMany: jest.fn().mockResolvedValue([profile]), findUnique: jest.fn().mockImplementation(() => Promise.resolve(profile)) },
      dailyReminderDelivery: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockImplementation(() => {
        if (sent || attempts >= 3 || Date.now() < nextAttempt) return Promise.resolve({ count: 0 });
        attempts++; nextAttempt = Date.now() + 60_000; return Promise.resolve({ count: 1 });
      }), update: jest.fn().mockImplementation(({ data }) => { if (data.sentAt) sent = true; return Promise.resolve({}); }) },
      dailyCheckIn: { findUnique: jest.fn().mockResolvedValue(null) } };
    const values: Record<string, string> = { DAILY_REMINDER_HOUR: '12', DAILY_REMINDER_MINUTE: '0', DAILY_REMINDER_TIMEZONE: 'America/Sao_Paulo',
      SMTP_HOST: 'smtp.invalid', SMTP_USER: 'test', SMTP_PASS: 'test' };
    settings = databaseConfig(values);
    service = new NotificationsService(settings, database as unknown as PrismaService,
      { findSafeById: jest.fn().mockResolvedValue(profile) } as unknown as UsersService);
    sendMail.mockReset().mockResolvedValue({ messageId: 'fictional' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });
  afterEach(() => jest.useRealTimers());

  it('uses the check-in reference day and prevents duplicates, including after restart', async () => {
    await tick(); await tick();
    expect(database.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dailyReminder: true } }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].text).toContain('Registre como foi seu dia');
    service = new NotificationsService(settings, database as unknown as PrismaService, {} as UsersService);
    await tick();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('does not suppress today due to a retroactive check-in registered now', async () => {
    await tick(); expect(sendMail).toHaveBeenCalledTimes(1);
    expect(database.dailyCheckIn.findUnique).toHaveBeenCalledWith({ where: { userId_date: { userId: profile.id, date: new Date('2026-11-03T00:00:00Z') } }, select: { id: true } });
  });
  it('does not send outside the configured minute', async () => {
    jest.setSystemTime(new Date('2026-11-03T14:59:00Z'));
    await tick(); expect(database.user.findMany).not.toHaveBeenCalled();
  });
  it('skips reminders when today already has a daily check-in', async () => {
    database.dailyCheckIn.findUnique.mockResolvedValue({ id: 'fictional-check-in' });
    await tick(); expect(sendMail).not.toHaveBeenCalled();
    expect(database.dailyReminderDelivery.upsert).not.toHaveBeenCalled();
  });
  it('allows retry after SMTP fails without marking delivery as sent', async () => {
    sendMail.mockRejectedValueOnce(new Error('fictional SMTP failure'));
    await tick(); await tick(); expect(sendMail).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date('2026-11-03T15:01:00Z'));
    await tick(); expect(sendMail).toHaveBeenCalledTimes(2);
  });
  it('limits failed SMTP attempts to three per day', async () => {
    sendMail.mockRejectedValue(new Error('fictional failure'));
    for (const minute of [0, 1, 2, 3]) {
      jest.setSystemTime(new Date(Date.UTC(2026, 10, 3, 15, minute)));
      await tick();
    }
    expect(sendMail).toHaveBeenCalledTimes(3);
  });
  it('test delivery respects saved preferences and does not send a second risk message', async () => {
    profile.dailyReminder = false;
    const result = await service.sendTestNotification({ id: profile.id } as Parameters<NotificationsService['sendTestNotification']>[0], { dailyReminder: true });
    expect(result.dailyReminder.status).toBe('skipped');
    expect(result).not.toHaveProperty('emailAlert');
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('rechecks opt-out before delivery and stops retries after the grace period', async () => {
    profile.dailyReminder = false;
    await tick(); expect(sendMail).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2026-11-03T15:11:00Z'));
    database.user.findMany.mockClear();
    await tick(); expect(database.user.findMany).not.toHaveBeenCalled();
  });
});

function databaseConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}
