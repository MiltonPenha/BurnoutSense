// Local real-stack acceptance tests. Only this fictional account is removed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const { CookieApiClient } = require('./cookie-api-client.cjs');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const config = createRequire(require.resolve('@nestjs/config'))('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
  assert.notEqual(config.NODE_ENV, 'production');
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(config.DATABASE_URL).hostname));
  const api = 'http://localhost:3001', web = 'http://localhost:3000';
  const client = new CookieApiClient(api, web), checks = [], errors = [];
  const check = (label, value) => { assert.ok(value, label); checks.push(label); };
  const { chromium } = require(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  const tag = randomBytes(8).toString('hex'), email = `qa-cookie-${tag}@example.invalid`, password = 'Test1-' + tag;
  let account;
  try {
    check('health is public and minimal', JSON.stringify(await client.json('/health')) === '{"status":"ok"}');
    check('login without origin and CSRF is rejected', (await client.raw('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })).status === 403);
    account = await client.json('/auth/register', 'POST', { name: 'Teste fictício de cookies', email, password });
    await client.json('/users/me', 'PATCH', { dailyReminder: false });
    check('register response contains no credential tokens', !('accessToken' in account) && !('refreshToken' in account) && !!account.user.id);
    const cookies = client.jar.getCookiesSync(api);
    check('session and CSRF cookies are HttpOnly, host-only and Lax', cookies.filter(c => ['bs_access', 'bs_refresh', 'bs_csrf'].includes(c.key)).every(c => c.httpOnly && c.hostOnly && c.sameSite === 'lax'));
    const access = cookies.find(c => c.key === 'bs_access').value;
    check('legacy Bearer without cookies is refused', (await fetch(api + '/users/me', { headers: { Authorization: 'Bearer ' + access } })).status === 401);
    check('cross-site mutation cannot use the cookie session', (await client.raw('/users/me', { method: 'PATCH', headers: { Origin: 'https://untrusted.example', 'X-CSRF-Token': client.csrf }, body: JSON.stringify({ name: 'Must not save' }) })).status === 403);
    check('DELETE without CSRF is rejected', (await client.raw('/users/me', { method: 'DELETE', headers: { Origin: web } })).status === 403);
    await page.clock.install();
    await page.goto(web + '/login');
    await page.locator('#email').fill(email); await page.locator('#password').fill(password);
    const login = page.waitForResponse(r => r.url() === api + '/auth/login' && r.ok());
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const response = await (await login).json();
    check('browser login JSON never exposes tokens', !response.accessToken && !response.refreshToken);
    await page.waitForURL('**/dashboard'); await page.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    check('no auth secrets in browser storage or document.cookie', await page.evaluate(() => !localStorage.getItem('burnoutsense.auth.accessToken') && !localStorage.getItem('burnoutsense.auth.refreshToken') && !/bs_access|bs_refresh|bs_csrf/.test(document.cookie)));
    await page.reload(); await page.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    check('F5 restores the server session', true);
    const tab = await ctx.newPage(); tab.on('pageerror', error => errors.push(error.message));
    await tab.goto(web + '/dashboard'); await tab.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    check('new tab restores shared cookies without storage tokens', true);
    const expiredAccess = async () => {
      const current = (await ctx.cookies(api)).find(c => c.name === 'bs_access');
      const { JwtService } = createRequire(path.join(root, 'backend/package.json'))('@nestjs/jwt');
      const jwt = new JwtService(), payload = jwt.decode(current.value);
      const value = jwt.sign({ sub: payload.sub, sid: payload.sid }, { secret: config.JWT_ACCESS_SECRET, expiresIn: -10 });
      await ctx.addCookies([{ ...current, value }]);
    };
    await expiredAccess();
    const renewal = page.waitForResponse(r => r.url() === api + '/auth/refresh' && r.ok());
    await page.reload(); await renewal; await page.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    check('expired access token refreshes transparently', true);
    await expiredAccess();
    await Promise.all([page.reload(), tab.reload()]);
    await page.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    await tab.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    check('parallel tabs coordinate refresh without logging out', true);
    await page.route('**/auth/session', route => route.abort());
    await page.reload(); await page.getByRole('heading', { name: 'Sessão indisponível' }).waitFor();
    check('network failure preserves the auth cookie', (await ctx.cookies(api)).some(c => c.name === 'bs_refresh'));
    await page.unroute('**/auth/session'); await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await page.getByRole('heading', { name: 'Sua primeira avaliação', exact: true }).waitFor();
    check('restoration retries after network recovery', true);
    const replay = new CookieApiClient(api, web);
    for (const cookie of await ctx.cookies(api)) replay.jar.setCookieSync(`${cookie.name}=${cookie.value}; Path=/`, api);
    replay.csrf = (await replay.json('/auth/csrf')).csrfToken;
    await page.clock.fastForward(30 * 60 * 1000 + 100);
    await page.waitForURL('**/login'); await tab.waitForURL('**/login');
    check('idle timeout logs out on server and synchronizes tabs', !(await ctx.cookies(api)).some(c => ['bs_access', 'bs_refresh'].includes(c.name)));
    check('replayed JWT is refused immediately after logout', (await replay.request('/users/me')).status === 401);
    check('revoked refresh token is refused', (await replay.request('/auth/refresh', 'POST')).status === 401);
    check('other independent session for the same fictional account survives', (await client.json('/auth/session')).user.id === account.user.id);
    check('no runtime errors', errors.length === 0);
    const output = path.join(root, '.run-logs/cookie-auth'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, output }));
  } finally {
    await browser.close(); if (account) await client.json('/users/me', 'DELETE');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
