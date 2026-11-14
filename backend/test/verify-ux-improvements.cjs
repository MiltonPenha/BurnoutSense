// Local opt-in acceptance check. Fictional accounts only; no e-mail is sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { createTestTransport } = require('./cookie-api-client.cjs');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const cfg = createRequire(require.resolve('@nestjs/config'))('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(cfg.DATABASE_URL).hostname));
  assert.notEqual(cfg.NODE_ENV, 'production');
  const { chromium } = require(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = path.join(root, '.run-logs/ux-improvements'); fs.mkdirSync(output, { recursive: true });
  const api = 'http://localhost:3001', web = 'http://localhost:3000';
  const transport = createTestTransport(api, web);
  const accounts = [], checks = [], runtimeErrors = [];
  let page;
  const check = (label, value) => { assert.ok(value, label); checks.push(label); };
  async function json(route, token, method = 'GET', body) {
    const send = () => transport.request(route, method, body, token);
    let response = await send();
    if (route === '/auth/register' && response.status === 429) { await new Promise(resolve => setTimeout(resolve, 65000)); response = await send(); }
    assert.ok(response.ok, route + ': HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  }
  async function account() {
    const tag = randomBytes(5).toString('hex'), password = 'Teste1' + tag, email = 'qa-ux-' + tag + '@example.invalid';
    const auth = await json('/auth/register', null, 'POST', { name: 'Teste fictício de usabilidade', email, password });
    accounts.push({ ...auth, email, password }); await json('/users/me', auth.user.id, 'PATCH', { dailyReminder: false });
    return { ...auth, email, password };
  }
  const fit = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto(web + '/login');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.id === 'email');
    check('login announces errors and focuses the empty email', await page.locator('#email').evaluate(el => el === document.activeElement && el.getAttribute('aria-invalid') === 'true') && await page.locator('.login-page .form-error[role="alert"]').count() === 1);
    await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
    check('password visibility remains available', await page.locator('#password').getAttribute('type') === 'text');
    await page.goto(web + '/cadastro');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.id === 'name');
    check('registration links each invalid field to its message', await page.locator('#name').getAttribute('aria-describedby') === 'signup-name-error' && await page.locator('#name').evaluate(el => el === document.activeElement));

    const first = await account(), second = await account();
    await transport.addToBrowser(context, first.user.id);
    await page.goto(web + '/contexto');
    await page.locator('[name="ctx-semester"]').waitFor();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.name?.startsWith('ctx-'));
    check('initial context identifies and focuses the unanswered field', await page.locator('[aria-invalid="true"]').count() > 0 && await page.evaluate(() => document.activeElement.name?.startsWith('ctx-')));
    const form = await json('/esbeu-assessments/form', first.user.id);
    const response = await fetch(cfg.AI_SERVICE_URL + '/v1/examples', { headers: { 'X-API-Key': cfg.AI_SERVICE_API_KEY } });
    const fixture = (await response.json()).prediction_request.context;
    async function fillField(field) {
      const input = page.locator('[name="ctx-' + field.identifier + '"]');
      const raw = fixture[field.identifier];
      if (field.choices.length <= 5 && field.choices.length) {
        const value = raw === 'Não se aplica' ? 'na' : String(field.choices.indexOf(raw));
        await page.locator('[name="ctx-' + field.identifier + '"][value="' + value + '"]').check();
      } else if (field.choices.length) await input.selectOption(String(field.choices.indexOf(raw)));
      else await input.fill(String(raw));
    }
    for (const field of form.fields.filter(field => field.group === 'academic')) await fillField(field);
    await page.locator('[name="ctx-semester"]').fill(String(form.fields.find(field => field.identifier === 'semester').maximum + 1));
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.id === 'ctx-semester');
    check('out-of-range context answers have inline errors and focus', await page.locator('#ctx-semester').getAttribute('aria-invalid') === 'true' && await page.locator('#ctx-semester').evaluate(el => el === document.activeElement));
    await page.locator('#ctx-semester').fill(String(fixture.semester));
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.locator('[name="ctx-sleep_hours"]').fill('7,5');
    await page.waitForTimeout(500); await page.reload();
    await page.getByText('Seu rascunho desta sessão foi recuperado.', { exact: true }).waitFor();
    check('context draft restores its stage and decimal answer after reload', await page.locator('[name="ctx-sleep_hours"]').inputValue() === '7,5');
    for (const group of ['routine', 'demands', 'support', 'financial']) {
      for (const field of form.fields.filter(field => field.group === group)) await fillField(field);
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    }
    await page.getByRole('heading', { name: 'Tudo pronto para calcular?', exact: true }).waitFor();
    check('draft recovery does not restore consent confirmations', !await page.locator('#confirmation-consent').isChecked());
    for (const key of ['adult', 'enrolled', 'consent', 'reviewed']) await page.locator('#confirmation-' + key).check();
    await page.getByRole('button', { name: 'Ver meu primeiro índice', exact: true }).click();
    await page.getByText('Seu primeiro índice está pronto.', { exact: true }).waitFor();
    const initialContext = (await json('/esbeu-assessments/current', first.user.id)).assessment;
    check('the full context still saves exactly 22 model fields', Object.keys(initialContext.context).length === 22);
    check('successful context completion erases its draft', await page.evaluate(() => !Object.keys(sessionStorage).some(key => key.startsWith('burnoutsense.context-draft:'))));
    await page.goto(web + '/contexto');
    await page.getByRole('button', { name: 'Revisar respostas', exact: true }).nth(1).click();
    await page.locator('#ctx-sleep_hours').fill('7,5'); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await page.waitForURL('**/login');
    check('logout erases temporary context drafts', await page.evaluate(() => !Object.keys(sessionStorage).some(key => key.startsWith('burnoutsense.context-draft:'))));
    await page.locator('#email').fill(second.email); await page.locator('#password').fill(second.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.waitForURL('**/dashboard');
    await page.goto(web + '/contexto'); await page.locator('[name="ctx-semester"]').waitFor();
    check('a different account starts with blank answers', await page.locator('#ctx-semester').inputValue() === '' && await page.getByText('Seu rascunho desta sessão foi recuperado.', { exact: true }).count() === 0);
    await json('/esbeu-assessments', second.user.id, 'POST', { context: fixture, adult: true, enrolled: true, consent: true, consentVersion: form.consent.version });
    await page.goto(web + '/registro');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.closest('#daily-mood'));
    check('daily check-in marks unanswered groups and moves focus', await page.locator('#daily-mood').getAttribute('aria-invalid') === 'true' && await page.locator('#daily-mood input').first().evaluate(el => el === document.activeElement));
    await page.getByRole('radio', { name: 'Calmo', exact: true }).check();
    await page.locator('#daily-sleep').fill('0'); await page.locator('[name="sleep_quality"][value="0"]').check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar meu dia', exact: true }).click();
    check('second daily step identifies its own missing answers', await page.locator('#daily-assessment_pressure').getAttribute('aria-invalid') === 'true');
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await page.locator('#daily-sleep').fill('7,5'); await page.locator('[name="sleep_quality"][value="3"]').check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    for (const [key, value] of Object.entries({ assessment_pressure: 2, study_rest_difficulty: 1, personal_support: 3 })) await page.locator('[name="' + key + '"][value="' + value + '"]').check();
    await page.getByRole('button', { name: 'Salvar meu dia', exact: true }).click(); await page.waitForURL('**/dashboard');
    await page.locator('.app-notice').getByText('Check-in salvo', { exact: true }).waitFor();
    check('decimal daily check-in saves and returns to dashboard', true);
    const saved = await json('/daily-check-ins/overview', second.user.id);
    check('backend receives the actual decimal value', saved.todayCheckIn.sleepHours === 7.5);
    const help = page.locator('.app-shell > .sidebar .index-help');
    check('index explanation is optional, not permanently expanded', !await help.getAttribute('open'));
    await help.locator('summary').click(); check('index help explains non-diagnostic meaning', await help.getByText(/não indica chance/).isVisible());
    await help.locator('summary').click();
    await page.goto(web + '/perfil');
    await page.locator('.profile-tabs').waitFor();
    check('profile tabs are connected to panels with one keyboard entry', await page.getByRole('tab').evaluateAll(tabs => tabs.filter(tab => tab.tabIndex === 0).length === 1 && tabs.every(tab => document.getElementById(tab.getAttribute('aria-controls'))?.getAttribute('aria-labelledby') === tab.id)));
    await page.getByRole('tab', { name: /Dados/ }).focus(); await page.keyboard.press('End');
    check('profile End key selects privacy', await page.getByRole('tab', { name: /Privacidade/ }).getAttribute('aria-selected') === 'true');
    const trigger = page.getByRole('button', { name: 'Excluir minha conta', exact: true }); await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Excluir sua conta?', exact: true });
    await dialog.waitFor();
    check('account dialog starts focused inside', await dialog.evaluate(el => el.contains(document.activeElement)));
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); check('account dialog retains focus ' + i, await dialog.evaluate(el => el.contains(document.activeElement))); }
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    check('Escape closes dialog and restores trigger focus', await trigger.evaluate(el => el === document.activeElement));
    await page.getByRole('tab', { name: /Dados/ }).click();
    await page.locator('#profile-photo').setInputFiles({ name: 'fictional.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('button', { name: 'Remover', exact: true }).click();
    await page.getByRole('dialog', { name: 'Remover foto de perfil?' }).getByRole('button', { name: 'Remover foto', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.id === 'profile-change-photo');
    check('removing draft photo restores focus to change-photo button', await page.locator('#profile-change-photo').evaluate(el => el === document.activeElement));
    await page.getByRole('tab', { name: /Preferências/ }).click();
    await page.getByRole('button', { name: /Escuro/ }).click();
    check('theme selection is not applied before save', await page.evaluate(() => document.documentElement.dataset.theme !== 'dark'));
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') {
        await page.getByRole('button', { name: /Claro/ }).click(); await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
        await page.waitForFunction(() => document.documentElement.dataset.theme !== 'dark');
      }
      await page.goto(web + '/dashboard'); await page.locator('.dashboard-new-record').waitFor();
      const contrast = await page.locator('.dashboard-new-record').evaluate(el => {
        const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        const style = getComputedStyle(el), a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      check('primary button contrast passes AA in ' + theme, contrast >= 4.5);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 950 }); await page.waitForTimeout(120);
        check(`dashboard reflows at ${width}px in ${theme}`, await fit());
        await page.screenshot({ path: path.join(output, `dashboard-${theme}-${width}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator('.app-shell > .sidebar').getByRole('link', { name: 'Perfil', exact: true }).click();
      await page.getByRole('tab', { name: /Preferências/ }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.getByRole('button', { name: 'Abrir menu', exact: true }); await menu.focus();
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); check('closed mobile menu has no keyboard focus ' + i, await page.evaluate(() => !document.activeElement.closest('.mobile-sidebar'))); }
    await menu.click(); const navigation = page.getByRole('dialog', { name: 'Navegação', exact: true }); await navigation.waitFor();
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); check('open mobile menu traps focus ' + i, await navigation.evaluate(el => el.contains(document.activeElement))); }
    await page.keyboard.press('Escape'); await navigation.waitFor({ state: 'hidden' });
    check('mobile Escape restores the menu button', await menu.evaluate(el => el === document.activeElement));
    await menu.click(); await navigation.getByRole('link', { name: 'Dashboard', exact: true }).click(); await page.waitForURL('**/dashboard');
    check('mobile navigation closes its dialog', !await navigation.isVisible());
    await page.setViewportSize({ width: 1440, height: 1000 });
    let sharedRequests = 0;
    page.on('request', request => { if (['/users/me', '/esbeu-assessments'].includes(new URL(request.url()).pathname)) sharedRequests++; });
    for (const name of ['Perfil', 'Como funciona', 'Dashboard', 'Perfil', 'Dashboard']) {
      await page.locator('.app-shell > .sidebar').getByRole('link', { name, exact: true }).click(); await page.waitForTimeout(150);
    }
    check('client navigation reuses shared account data', sharedRequests === 0);
    await page.setViewportSize({ width: 720, height: 500 });
    check('layout reflows at the CSS width corresponding to 200% on a 1440px screen', await fit());
    check('there are no browser runtime errors', runtimeErrors.length === 0);
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, sharedRequests, screenshots: 10 }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, sharedRequests, output }));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    for (const account of accounts) {
      const response = await transport.request('/users/me', 'DELETE', undefined, account.user.id);
      if (response.status === 401) {
        await transport.request('/auth/login', 'POST', { email: account.email, password: account.password });
        assert.ok((await transport.request('/users/me', 'DELETE', undefined, account.user.id)).ok);
      } else assert.ok(response.ok);
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
