import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('ESB-eu daily reminders', () => {
  const sendMail = jest.fn();
  let service: NotificationsService;
  let database: { user: { findMany: jest.Mock; findUnique: jest.Mock }; dailyReminderDelivery: { createMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock }; dailyCheckIn: { findUnique: jest.Mock } };
  let settings: ConfigService;
  let profile: { id: string; name: string; email: string; dailyReminder: boolean };
  const tick = () => (service as unknown as { processDailyReminderTick(): Promise<void> }).processDailyReminderTick();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T15:00:00Z'));
    profile = { id: 'fictional', name: 'Teste', email: 'test@example.invalid', dailyReminder: true };
    let sent = false, started = false, attempts = 0, nextAttempt = 0;
    database = { user: { findMany: jest.fn().mockResolvedValue([profile]), findUnique: jest.fn().mockImplementation(() => Promise.resolve(profile)) },
      dailyReminderDelivery: { createMany: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockImplementation(() => {
        if (sent || started || attempts >= 3 || Date.now() < nextAttempt) return Promise.resolve({ count: 0 });
        started = true; attempts++; nextAttempt = Date.now() + 60_000; return Promise.resolve({ count: 1 });
      }), update: jest.fn().mockImplementation(({ data }) => { if (data.sentAt) sent = true; if (data.submissionStartedAt === null) started = false; return Promise.resolve({}); }) },
      dailyCheckIn: { findUnique: jest.fn().mockResolvedValue(null) } };
    const values: Record<string, string> = { DAILY_REMINDER_HOUR: '12', DAILY_REMINDER_MINUTE: '0', DAILY_REMINDER_TIMEZONE: 'America/Sao_Paulo',
      SMTP_HOST: 'smtp.invalid', SMTP_USER: 'test', SMTP_PASS: 'test' };
    settings = databaseConfig(values);
    service = new NotificationsService(settings, database as unknown as PrismaService);
    sendMail.mockReset().mockResolvedValue({ messageId: 'fictional' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });
  afterEach(() => jest.useRealTimers());

  it('uses the check-in reference day and prevents duplicates, including after restart', async () => {
    await tick(); await tick();
    expect(database.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dailyReminder: true }) }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].text).toContain('Registre como foi seu dia');
    service = new NotificationsService(settings, database as unknown as PrismaService);
    await tick();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('does not suppress today due to a retroactive check-in registered now', async () => {
    await tick(); expect(sendMail).toHaveBeenCalledTimes(1);
    expect(database.dailyReminderDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ user: { dailyReminder: true, email: profile.email,
        dailyCheckIns: { none: { date: new Date('2026-11-03T00:00:00Z') } } } }),
    }));
  });
  it('does not send before the configured window', async () => {
    jest.setSystemTime(new Date('2026-11-03T14:59:00Z'));
    await tick(); expect(database.user.findMany).not.toHaveBeenCalled();
  });
  it('skips reminders when today already has a daily check-in', async () => {
    database.user.findMany.mockResolvedValue([]);
    await tick(); expect(sendMail).not.toHaveBeenCalled();
    expect(database.dailyReminderDelivery.createMany).not.toHaveBeenCalled();
  });
  it('allows retry after SMTP fails without marking delivery as sent', async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('fictional SMTP failure'), { responseCode: 451, command: 'DATA' }));
    await tick(); await tick(); expect(sendMail).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date('2026-11-03T15:01:00Z'));
    await tick(); expect(sendMail).toHaveBeenCalledTimes(2);
  });
  it('limits failed SMTP attempts to three per day', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('fictional failure'), { responseCode: 451, command: 'DATA' }));
    for (const minute of [0, 1, 2, 3]) {
      jest.setSystemTime(new Date(Date.UTC(2026, 10, 3, 15, minute)));
      await tick();
    }
    expect(sendMail).toHaveBeenCalledTimes(3);
  });
  it('retains the submission marker after an ambiguous SMTP disconnect', async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('fictional disconnect'), { code: 'ECONNRESET', command: 'DATA' }));
    await tick();
    expect(database.dailyReminderDelivery.update).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2026-11-03T15:06:00Z'));
    service = new NotificationsService(settings, database as unknown as PrismaService);
    await tick();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not submit when the batch crosses the dispatch window', async () => {
    database.dailyReminderDelivery.createMany.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date('2026-11-03T15:11:00Z'));
    });
    await tick();
    expect(database.dailyReminderDelivery.updateMany).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rechecks opt-out before delivery and stops retries after the grace period', async () => {
    database.dailyReminderDelivery.updateMany.mockResolvedValue({ count: 0 });
    await tick(); expect(sendMail).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2026-11-03T15:11:00Z'));
    database.user.findMany.mockClear();
    await tick(); expect(database.user.findMany).not.toHaveBeenCalled();
  });

  it('sends recovery mail independently of the daily reminder preference', async () => {
    profile.dailyReminder = false;
    const url = 'https://burnoutsense.online/redefinir-senha#token=fictional-test-only';
    await service.sendPasswordReset(profile.email, url);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toEqual(expect.objectContaining({
      to: profile.email, subject: 'Redefina sua senha do BurnoutSense',
      text: expect.stringContaining('30 minutos'), html: expect.stringContaining(`href="${url}"`),
    }));
  });

  it('confirms a password change without including the password or a reset link', async () => {
    await service.sendPasswordChanged(profile.id);
    expect(sendMail.mock.calls[0][0]).toEqual(expect.objectContaining({
      to: profile.email, subject: 'Sua senha do BurnoutSense foi alterada',
    }));
    expect(sendMail.mock.calls[0][0].text).toContain('sessões anteriores foram encerradas');
    expect(sendMail.mock.calls[0][0].html).not.toContain('#token=');
  });
});

function databaseConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}
