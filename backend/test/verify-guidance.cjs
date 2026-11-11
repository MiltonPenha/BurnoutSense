// Optional live local check: creates/deletes fictional accounts; never sends e-mail.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const cfg = createRequire(require.resolve('@nestjs/config'))('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
  const api = 'http://localhost:3001', web = 'http://127.0.0.1:3000';
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(cfg.DATABASE_URL).hostname));
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(cfg.AI_SERVICE_URL).hostname));
  assert.notEqual(cfg.NODE_ENV, 'production');
  const { chromium } = require(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const directory = path.join(root, '.run-logs/ux-audit');
  fs.mkdirSync(directory, { recursive: true });
  const accounts = [], checks = [], views = [], findings = {};
  let auth, page;
  const check = (label, value) => { assert.ok(value, label); checks.push(label); };
  async function request(route, method = 'GET', body, token = auth?.accessToken) {
    return fetch(api + route, { method, signal: AbortSignal.timeout(35000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  }
  async function json(route, method, body, token) {
    let response = await request(route, method, body, token);
    if (route === '/auth/register' && response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 65000));
      response = await request(route, method, body, token);
    }
    assert.ok(response.ok, route + ': HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  }
  async function account() {
    const tag = randomBytes(6).toString('hex');
    const value = await json('/auth/register', 'POST', { name: 'Teste fictício de orientações', email: 'qa-guidance-' + tag + '@example.invalid', password: 'Teste1' + tag });
    accounts.push(value); return value;
  }
  try {
    auth = await account();
    await json('/users/me', 'PATCH', { dailyReminder: false });
    const form = await json('/esbeu-assessments/form');
    const exampleResponse = await fetch(cfg.AI_SERVICE_URL + '/v1/examples', { headers: { 'X-API-Key': cfg.AI_SERVICE_API_KEY } });
    const context = (await exampleResponse.json()).prediction_request.context;
    const initial = await json('/esbeu-assessments', 'POST', { context, consent: true, adult: true, enrolled: true, consentVersion: form.consent.version });
    const today = (await json('/daily-check-ins/overview')).today;
    await json('/daily-check-ins', 'PUT', { date: today, mood: 'Calmo', sleepHours: 8, observations: { sleep_quality: 3, assessment_pressure: 2, study_rest_difficulty: 1, personal_support: 3 } });
    const current = (await json('/esbeu-assessments/current')).assessment;
    const guidance = await json('/guidance/' + current.id);
    check('live Gemini generates two or three items in each list', guidance.status === 'ready' && [2, 3].includes(guidance.tips.length) && guidance.tips.length === guidance.recommendations.length);
    const cached = await json('/guidance/' + current.id);
    check('repeated reads reuse the generated response', guidance.generatedAt === cached.generatedAt);
    check('unauthenticated guidance is blocked', (await request('/guidance/' + initial.id, 'GET', undefined, '')).status === 401);
    const foreign = await account();
    check('another account cannot request guidance for this assessment', (await request('/guidance/' + current.id, 'GET', undefined, foreign.accessToken)).status === 404);
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await browserContext.addInitScript(value => {
      localStorage.setItem('burnoutsense.auth.accessToken', value.accessToken);
      localStorage.setItem('burnoutsense.auth.refreshToken', value.refreshToken);
    }, auth);
    page = await browserContext.newPage(); page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const routes = [
      ['/dashboard', '.guidance-list'], ['/registro', '.daily-form'], ['/contexto?revisao=escolher', '.review-topic'],
      ['/historico', '.daily-history-item'], ['/perfil', '.profile-tabs'], ['/como-funciona', '.help-questions'],
    ];
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.goto(web + '/perfil');
        await page.getByRole('tab', { name: 'Preferências', exact: false }).click();
        await page.getByRole('button', { name: /Escuro/ }).click();
        const save = page.waitForResponse(r => r.url().endsWith('/users/me') && r.request().method() === 'PATCH');
        await page.getByRole('button', { name: 'Salvar alterações' }).click(); await save;
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      }
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        for (const [route, selector] of routes) {
          await page.goto(web + route);
          await page.locator(selector).first().waitFor();
          await page.waitForTimeout(220);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
          views.push({ route, theme, width, overflow });
          check(`${route}: no overflow at ${width} in ${theme}`, !overflow);
          const label = route.split('?')[0].slice(1);
          await page.screenshot({ path: path.join(directory, `${label}-${theme}-${width}.png`), fullPage: true });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(web + '/dashboard'); await page.locator('.guidance-list').first().waitFor();
    check('both live guidance lists render on the dashboard', await page.locator('.guidance-list').count() === 2 && await page.locator('.guidance-list li').count() === guidance.tips.length * 2);
    findings.buttonColors = await page.locator('.dashboard-new-record').evaluate(el => ({ text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(120);
      check(`dashboard guidance fits ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(web + '/perfil'); await page.locator('.profile-tabs').waitFor();
    findings.profileTabs = await page.getByRole('tab').evaluateAll(tabs => tabs.map(tab => ({ controls: tab.getAttribute('aria-controls'), id: tab.id, tabIndex: tab.tabIndex })));
    await page.getByRole('tab', { name: 'Privacidade', exact: false }).click();
    await page.getByRole('button', { name: 'Excluir minha conta', exact: true }).click();
    findings.accountDialogFocusStartsInside = await page.evaluate(() => Boolean(document.activeElement.closest('dialog[open], [role="dialog"]')));
    check('account dialog receives initial focus', findings.accountDialogFocusStartsInside);
    await page.keyboard.press('Escape');
    findings.accountDialogRemainsAfterEscape = await page.getByRole('dialog', { name: 'Excluir sua conta?', exact: true }).isVisible();
    check('account dialog closes on Escape', !findings.accountDialogRemainsAfterEscape);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).focus();
    findings.closedMenuReceivesKeyboardFocus = false;
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => Boolean(document.activeElement.closest('.mobile-sidebar')))) findings.closedMenuReceivesKeyboardFocus = true;
    }
    check('closed mobile menu is excluded from keyboard navigation', !findings.closedMenuReceivesKeyboardFocus);
    await page.goto(web + '/dashboard');
    await page.route('**/guidance/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assessmentId: current.id, status: 'unavailable', message: 'Teste de indisponibilidade do provedor.' }) }));
    await page.reload();
    await page.locator('.guidance-status').getByRole('button', { name: 'Tentar novamente' }).waitFor();
    check('provider outage has a retry state without fabricated advice', await page.locator('.guidance-list').count() === 0);
    check('no browser runtime errors', errors.length === 0);
    fs.writeFileSync(path.join(directory, 'application-checks.json'), JSON.stringify({ checks, views, findings }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, screenshots: views.length, findings, output: directory }));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(directory, 'guidance-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    for (const account of accounts) assert.ok((await request('/users/me', 'DELETE', undefined, account.accessToken)).ok, 'fictional account cleanup');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
