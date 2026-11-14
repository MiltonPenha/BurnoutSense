// Real local database and HTTP flow, with SMTP replaced in memory. No real mail.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes, createHash } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ConfigModule } = require('@nestjs/config');
const { ValidationPipe } = require('@nestjs/common');
const cookieParser = require('cookie-parser');
const { PrismaModule } = require('../dist/prisma/prisma.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { UsersModule } = require('../dist/users/users.module');
const { AuthModule } = require('../dist/auth/auth.module');
const { PasswordResetService } = require('../dist/auth/password-reset.service');
const { NotificationsService } = require('../dist/notifications/notifications.service');
const { SessionSecurityService } = require('../dist/auth/session-security.service');
const { CookieApiClient } = require('./cookie-api-client.cjs');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const cfg = createRequire(require.resolve('@nestjs/config'))('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
  assert.notEqual(cfg.NODE_ENV, 'production');
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(cfg.DATABASE_URL).hostname));
  const api = 'http://localhost:3001', web = 'http://localhost:3000';
  assert.equal(cfg.FRONTEND_URL, web);
  const sent = new Map(), confirmed = [], checks = [], errors = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const mail = {
    sendPasswordReset: async (email, url) => { sent.set(email, url); return { status: 'sent' }; },
    sendPasswordChanged: async id => { confirmed.push(id); return { status: 'sent' }; },
  };
  const module = await Test.createTestingModule({ imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: path.join(root, 'backend/.env') }), PrismaModule, UsersModule, AuthModule,
  ] }).overrideProvider(NotificationsService).useValue(mail).compile();
  const app = module.createNestApplication({ logger: false });
  const security = app.get(SessionSecurityService), db = app.get(PrismaService), passwords = app.get(PasswordResetService);
  const flush = () => Promise.all([...passwords.pending.values()]);
  app.use(cookieParser());
  app.enableCors({ origin: web, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token'] });
  app.use(security.protect);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, validationError: { target: false, value: false } }));
  await app.listen(3001, '127.0.0.1');
  const { chromium } = require(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
  const output = path.join(root, '.run-logs/password-recovery'); fs.mkdirSync(output, { recursive: true });
  const tag = randomBytes(8).toString('hex'), email = `qa-recovery-${tag}@example.invalid`;
  const oldPassword = 'OldTest1-' + tag, nextPassword = 'NextTest2-' + tag;
  const client = new CookieApiClient(api, web), second = new CookieApiClient(api, web);
  let id;
  try {
    const account = await client.json('/auth/register', 'POST', { name: 'Teste fictício de recuperação', email, password: oldPassword }); id = account.user.id;
    await second.json('/auth/login', 'POST', { email, password: oldPassword });
    check('new accounts start with reminders disabled', !account.user.dailyReminder);
    check('missing CSRF cannot request recovery', (await client.raw('/auth/forgot-password', { method: 'POST', headers: { Origin: web }, body: JSON.stringify({ email }) })).status === 403);
    await page.goto(web + '/login');
    await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
    await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
    check('recovery focuses the invalid email', await page.locator('#email').evaluate(el => el === document.activeElement));
    await page.locator('#email').fill(email);
    await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
    await page.getByRole('heading', { name: 'Confira seu e-mail' }).waitFor(); await flush();
    check('recovery mail is queued despite reminders being disabled', sent.has(email));
    const publicMessage = await client.json('/auth/forgot-password', 'POST', { email });
    const unknown = await client.json('/auth/forgot-password', 'POST', { email: `unknown-${tag}@example.invalid` }); await flush();
    check('unknown accounts receive an identical response', JSON.stringify(publicMessage) === JSON.stringify(unknown));
    check('cooldown does not replace a newly issued link', sent.size === 1);
    const firstUrl = sent.get(email), tokenFrom = url => new URLSearchParams(new URL(url).hash.slice(1)).get('token');
    const token = tokenFrom(firstUrl);
    const record = await db.passwordResetToken.findUnique({ where: { userId: id } });
    check('only a token digest is persisted', record.tokenHash === createHash('sha256').update(token).digest('hex') && record.tokenHash !== token);
    await client.addToBrowser(context);
    await page.goto(firstUrl);
    await page.getByRole('heading', { name: 'Crie sua nova senha' }).waitFor();
    check('recovery links remain accessible with an existing session', !page.url().includes('/dashboard'));
    check('token is removed from the address and storage', await page.evaluate(() => !location.hash && !Object.values(localStorage).some(value => value.includes('token='))));
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    check('weak password focuses the password field', await page.locator('#password').evaluate(el => el === document.activeElement));
    await page.locator('#password').fill(nextPassword);
    await page.locator('#confirmPassword').fill('Different1');
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await page.getByText('A confirmação precisa ser igual à senha.', { exact: true }).waitFor();
    check('password confirmation is required', true);
    await page.locator('#confirmPassword').fill(nextPassword);
    await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
    check('password visibility works', await page.locator('#password').getAttribute('type') === 'text');
    await page.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      check(`reset form fits ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `reset-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await page.getByRole('heading', { name: 'Senha redefinida' }).waitFor();
    check('password can be reset through the real form', true);
    check('all old access sessions are rejected', (await client.request('/auth/session')).status === 401 && (await second.request('/auth/session')).status === 401);
    check('old refresh sessions are rejected', (await second.request('/auth/refresh', 'POST')).status === 401);
    const anonymous = new CookieApiClient(api, web);
    check('a consumed token cannot be reused', (await anonymous.request('/auth/reset-password', 'POST', { token, password: nextPassword })).status === 400);
    check('old password is refused', (await anonymous.request('/auth/login', 'POST', { email, password: oldPassword })).status === 401);
    check('new password signs in normally', (await anonymous.json('/auth/login', 'POST', { email, password: nextPassword })).user.id === id);
    check('change confirmation is requested', confirmed.includes(id));

    await db.passwordResetToken.update({ where: { userId: id }, data: { createdAt: new Date(Date.now() - 120000) } });
    passwords.request(email); await flush();
    const expired = tokenFrom(sent.get(email));
    check('a new request replaces the previous link', expired !== token);
    await db.passwordResetToken.update({ where: { userId: id }, data: { expiresAt: new Date(0) } });
    check('expired links are rejected', (await anonymous.request('/auth/reset-password', 'POST', { token: expired, password: nextPassword })).status === 400);
    await page.goto(sent.get(email));
    await page.locator('#password').fill(nextPassword); await page.locator('#confirmPassword').fill(nextPassword);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click();
    await page.getByRole('heading', { name: 'Vamos tentar com outro link?' }).waitFor();
    check('expired links offer a recovery path', await page.getByRole('link', { name: 'Solicitar novo link' }).count() === 1);

    await db.passwordResetToken.update({ where: { userId: id }, data: { createdAt: new Date(Date.now() - 120000) } });
    passwords.request(email); await flush();
    const concurrentToken = tokenFrom(sent.get(email));
    const race = await Promise.allSettled([passwords.reset(concurrentToken, nextPassword), passwords.reset(concurrentToken, nextPassword)]);
    check('concurrent use succeeds exactly once', race.filter(result => result.status === 'fulfilled').length === 1);
    check('there are no browser runtime errors', errors.length === 0);
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, realMailSent: false }));
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(JSON.stringify({ lastCheck: checks.at(-1), failureType: error.name,
      ...(error.name === 'AssertionError' ? { assertion: error.message } : {}) }));
    throw error;
  } finally {
    await flush();
    if (id) await db.user.delete({ where: { id } });
    await browser.close(); await app.close();
  }
}
main().catch(() => { console.error('Password recovery verification failed; no private payloads logged.'); process.exitCode = 1; });
