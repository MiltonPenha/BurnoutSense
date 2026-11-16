// Opt-in database integration test. SMTP is intercepted and only temporary users are eligible.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const { NotificationsService } = require('../dist/notifications/notifications.service');
const dotenv = createRequire(require.resolve('@nestjs/config'))('dotenv');

async function main() {
  assert.equal(process.env.BURNOUTSENSE_DEMO_TEST_AUTHORIZED, 'true');
  const root = path.resolve(__dirname, '../..');
  const cfg = dotenv.parse(fs.readFileSync(path.join(root, '.demo/backend.env')));
  assert.ok(new URL(cfg.DATABASE_URL).hostname.endsWith('.render.com'));
  const db = new PrismaClient({ datasources: { db: { url: cfg.DATABASE_URL } } });
  const ids = [], mails = [], checks = [];
  const RealDate = Date, realTransport = nodemailer.createTransport;
  const tag = randomBytes(8).toString('hex'), today = '2026-11-16';
  let time = RealDate.parse(today + 'T14:59:00Z');
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  try {
    for (const [label, dailyReminder] of [['pending', true], ['done', true], ['off', false], ['retroactive', true], ['late', false]]) {
      const user = await db.user.create({ data: { name: 'Reminder QA ' + label, email: `qa-reminder-${tag}-${label}@example.invalid`, passwordHash: '!not-a-valid-login-hash', dailyReminder } });
      ids.push(user.id);
    }
    const [pending, done, off, retroactive, late] = ids;
    await db.dailyCheckIn.createMany({ data: [
      { userId: done, date: new RealDate(today + 'T00:00:00Z'), mood: 'Calmo', sleepHours: 7 },
      { userId: retroactive, date: new RealDate('2026-11-15T00:00:00Z'), mood: 'Calmo', sleepHours: 7 },
    ] });
    nodemailer.createTransport = () => ({ sendMail: async mail => {
      assert.ok(mail.to.startsWith(`qa-reminder-${tag}-`) && mail.to.endsWith('@example.invalid'));
      mails.push(mail.to); return { accepted: [mail.to], messageId: 'simulated-only' };
    } });
    global.Date = class extends RealDate {
      constructor(...args) { if (args.length) super(...args); else super(time); }
      static now() { return time; }
    };
    const scoped = { dailyReminderDelivery: db.dailyReminderDelivery,
      user: { findMany: args => db.user.findMany({ ...args, where: { ...args.where, id: { in: ids } } }) } };
    const values = { ...cfg, DAILY_REMINDER_HOUR: '12', DAILY_REMINDER_MINUTE: '0', DAILY_REMINDER_TIMEZONE: 'America/Sao_Paulo' };
    const settings = { get: key => values[key], getOrThrow: key => {
      if (!values[key]) throw new Error('Missing test setting'); return values[key];
    } };
    let service = new NotificationsService(settings, scoped);
    const tick = () => service.processDailyReminderTick();
    await tick(); check('11:59 Sao Paulo does not send', mails.length === 0);
    time = RealDate.parse(today + 'T15:00:00Z');
    await tick();
    check('12:00 sends only to opted-in users missing the reference-day check-in', mails.length === 2);
    check('the opted-out account is excluded by the actual database query', !mails.some(email => email.includes('-off@')));
    check('today check-in prevents a reminder', !mails.some(email => email.includes('-done@')));
    check('a retroactive check-in does not suppress today reminder', mails.some(email => email.includes('-retroactive@')));
    const deliveries = await db.dailyReminderDelivery.findMany({ where: { userId: { in: [pending, retroactive] } } });
    check('accepted submissions have one attempt and persistent timestamps', deliveries.length === 2 && deliveries.every(row => row.attempts === 1 && row.sentAt && row.submissionStartedAt));
    await tick(); service = new NotificationsService(settings, scoped); await tick();
    check('repeated ticks and backend restart do not send twice', mails.length === 2);
    await db.dailyCheckIn.deleteMany({ where: { userId: done } });
    await db.user.update({ where: { id: off }, data: { dailyReminder: true } });
    time += 60000; await tick();
    check('saved opt-in and missing check-in become eligible during the send window', mails.length === 4);
    await db.user.update({ where: { id: late }, data: { dailyReminder: true } });
    time = RealDate.parse(today + 'T15:11:00Z'); await tick();
    check('12:11 does not trigger a late batch', mails.length === 4);
    time = RealDate.parse('2026-11-17T15:00:00Z'); await tick();
    check('the next day creates new deliveries instead of suppressing reminders forever', mails.length === 9);
    console.log(JSON.stringify({ checks: checks.length, realMailSent: false, existingAccountsModified: false }));
  } finally {
    global.Date = RealDate; nodemailer.createTransport = realTransport;
    if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}
main().catch(() => { console.error('Reminder integration verification failed; private details omitted.'); process.exitCode = 1; });
