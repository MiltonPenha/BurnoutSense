// HTTPS browser -> Next /api -> isolated production NestJS -> authorized demo DB.
// SMTP is replaced in memory. Only the account created here is removed.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const cookieParser = require('cookie-parser');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { NotificationsService } = require('../dist/notifications/notifications.service');
const { SessionSecurityService } = require('../dist/auth/session-security.service');
const { PasswordResetService } = require('../dist/auth/password-reset.service');
const root = path.resolve(__dirname, '../..'), output = path.join(root, '.run-logs/hybrid-demo');
const dotenv = createRequire(require.resolve('@nestjs/config'))('dotenv');

async function main() {
  assert.equal(process.env.BURNOUTSENSE_DEMO_TEST_AUTHORIZED, 'true');
  const cfg = dotenv.parse(fs.readFileSync(path.join(root, '.demo/backend.env')));
  assert.ok(new URL(cfg.DATABASE_URL).hostname.endsWith('.render.com'));
  const origin = 'https://localhost:3443', tag = randomBytes(8).toString('hex'), gateway = randomBytes(32).toString('hex');
  Object.assign(process.env, cfg, { FRONTEND_URL: origin, DEMO_GATEWAY_SECRET: gateway, DAILY_REMINDER_ENABLED: 'false' });
  const mail = { sendPasswordReset: async (_email, url) => { mail.url = url; }, sendPasswordChanged: async () => {} };
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(NotificationsService).useValue(mail).compile();
  const app = module.createNestApplication({ logger: false }), security = app.get(SessionSecurityService), db = app.get(PrismaService);
  app.use(cookieParser()); app.use(security.protect);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, validationError: { target: false, value: false } }));
  await app.listen(4302, '127.0.0.1');
  fs.mkdirSync(output, { recursive: true });
  const cert = path.join(output, 'cert.pem'), key = path.join(output, 'key.pem');
  const openssl = process.env.BURNOUTSENSE_OPENSSL;
  const result = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore', windowsHide: true });
  assert.equal(result.status, 0);
  const out = fs.openSync(path.join(output, 'next.log'), 'w');
  const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3330'], {
    cwd: path.join(root, 'frontend'), env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_API_URL: '/api', BACKEND_PROXY_URL: 'http://127.0.0.1:4302', DEMO_GATEWAY_SECRET: gateway, DEMO_APP_ORIGIN: origin }, stdio: ['ignore', out, out], windowsHide: true,
  }); fs.closeSync(out);
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const upstream = http.request({ host: '127.0.0.1', port: 3330, path: req.url, method: req.method, headers: req.headers }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    upstream.on('error', () => { res.statusCode = 503; res.end(); }); req.pipe(upstream);
  });
  await new Promise(resolve => server.listen(3443, '127.0.0.1', resolve));
  const { chromium } = require(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), checks = [], errors = [];
  page.on('pageerror', error => errors.push(error.name)); page.setDefaultTimeout(20000);
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const call = async (route, method = 'GET', data) => {
    const csrf = method === 'GET' ? null : await (await context.request.get(origin + '/api/auth/csrf')).json();
    return context.request.fetch(origin + '/api' + route, { method, headers: { Origin: origin, ...(csrf ? { 'X-CSRF-Token': csrf.csrfToken } : {}) }, ...(data ? { data } : {}) });
  };
  const json = async (route, method, data) => { const response = await call(route, method, data); assert.ok(response.ok(), `HTTP ${response.status()}`); return response.json(); };
  const email = `qa-hybrid-${tag}@example.invalid`, password = 'Fictional1-' + tag;
  let id;
  try {
    for (let i = 0; i < 30; i++) { try { if ((await context.request.get(origin + '/api/health')).ok()) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
    check('direct gateway access without the private key is rejected', (await fetch('http://127.0.0.1:4302/health')).status === 403);
    check('HTTPS Next proxy reaches the database-backed API', (await json('/health')).status === 'ok');
    check('foreign-origin changes are rejected at the proxy', (await context.request.post(origin + '/api/auth/login', { headers: { Origin: 'https://untrusted.invalid' }, data: {} })).status() === 403);
    const auth = await json('/auth/register', 'POST', { name: 'Teste fictício do modo banca', email, password }); id = auth.user.id;
    check('registration JSON contains no credentials', !auth.accessToken && !auth.refreshToken);
    const cookies = await context.cookies(origin);
    check('all three production cookies reach the frontend separately and securely', ['__Host-bs_access', '__Host-bs_refresh', '__Host-bs_csrf'].every(name => cookies.some(cookie => cookie.name === name && cookie.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.path === '/')));
    check('CSRF remains required behind the gateway', (await context.request.patch(origin + '/api/users/me', { headers: { Origin: origin }, data: { name: 'Should not save' } })).status() === 403);
    await json('/auth/logout', 'POST');
    await page.goto(origin + '/login'); await page.locator('#email').fill(email); await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.waitForURL('**/dashboard');
    check('real browser login works through the HTTPS proxy', true);
    await page.reload(); await page.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    check('F5 restores the cookie session', true);
    check('no secrets appear in JS storage or document.cookie', await page.evaluate(() => !localStorage.getItem('burnoutsense.auth.accessToken') && !localStorage.getItem('burnoutsense.auth.refreshToken') && !document.cookie.includes('bs_access')));
    const form = await json('/esbeu-assessments/form');
    const example = await (await fetch(cfg.AI_SERVICE_URL + '/v1/examples', { headers: { 'X-API-Key': cfg.AI_SERVICE_API_KEY } })).json();
    const first = await json('/esbeu-assessments', 'POST', { context: example.prediction_request.context, consent: true, adult: true, enrolled: true, consentVersion: form.consent.version });
    check('the original RF/A saves an initial index behind the proxy', Number.isFinite(first.estimatedOverall));
    const today = (await json('/daily-check-ins/overview')).today;
    const daily = await json('/daily-check-ins', 'PUT', { date: today, mood: 'Calmo', sleepHours: 8, observations: { sleep_quality: 3, assessment_pressure: 2, study_rest_difficulty: 1, personal_support: 3 } });
    check('daily check-in uses real recalculation', ['updated', 'unchanged'].includes(daily.indexUpdate.status));
    await page.goto(origin + '/esqueci-senha'); await page.locator('#email').fill(email);
    await page.getByRole('button', { name: 'Enviar link de recuperação' }).click(); await page.getByRole('heading', { name: 'Confira seu e-mail' }).waitFor();
    await Promise.all([...app.get(PasswordResetService).pending.values()]); assert.ok(mail.url);
    await page.goto(mail.url); await page.locator('#password').fill('Changed1-' + tag); await page.locator('#confirmPassword').fill('Changed1-' + tag);
    await page.getByRole('button', { name: 'Salvar nova senha' }).click(); await page.getByRole('heading', { name: 'Senha redefinida' }).waitFor();
    check('password recovery and reset work through /api with simulated mail', true);
    check('old sessions are invalid after reset', (await call('/auth/session')).status() === 401);
    check('no browser runtime errors occurred', errors.length === 0);
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, realMailSent: false }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, realMailSent: false, productionCookies: true }));
  } catch (error) { console.error(JSON.stringify({ lastCheck: checks.at(-1), failureType: error.name })); throw new Error('Hybrid verification failed; private details omitted.'); }
  finally {
    await Promise.all([...app.get(PasswordResetService).pending.values()]);
    if (id) await db.user.delete({ where: { id } });
    await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    next.kill(); await app.close();
  }
}
main().catch(error => { console.error(error.message.startsWith('Hybrid verification') ? error.message : 'Hybrid setup failed; private details omitted.'); process.exitCode = 1; });
