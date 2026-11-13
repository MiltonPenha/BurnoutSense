// Opt-in local integration test. All accounts are fictional and removed afterwards.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const cfg = createRequire(require.resolve('@nestjs/config'))('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
  const api = process.env.BURNOUTSENSE_E2E_API_URL || 'http://localhost:3001';
  const web = process.env.BURNOUTSENSE_E2E_BASE_URL || 'http://127.0.0.1:3000';
  const ai = cfg.AI_SERVICE_URL;
  for (const url of [api, web, ai, cfg.DATABASE_URL]) assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname));
  assert.notEqual(cfg.NODE_ENV, 'production');
  const output = path.join(root, '.run-logs/dashboard-flow');
  fs.mkdirSync(output, { recursive: true });
  const { chromium } = require(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const accounts = [];
  const checks = [];
  let auth, page;
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  async function request(base, route, method = 'GET', body, token = auth?.accessToken) {
    return fetch(new URL(route, base), { method, signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...(base === ai ? { 'X-API-Key': cfg.AI_SERVICE_API_KEY } : token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined });
  }
  async function json(base, route, method, body, token) {
    const response = await request(base, route, method, body, token);
    assert.ok(response.ok, route + ': HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  }
  const apiCall = (route, method, body) => json(api, route, method, body);
  async function account() {
    const tag = randomBytes(6).toString('hex');
    const result = await json(api, '/auth/register', 'POST', { name: 'Teste fictício da dashboard', email: 'qa-dashboard-' + tag + '@example.invalid', password: 'Teste1' + tag });
    accounts.push(result); return result;
  }
  const shift = (day, n) => { const date = new Date(day + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); };
  const poor = { sleep_quality: 1, assessment_pressure: 4, study_rest_difficulty: 3, personal_support: 1 };
  const good = { sleep_quality: 3, assessment_pressure: 2, study_rest_difficulty: 1, personal_support: 3 };
  try {
    auth = await account();
    await apiCall('/users/me', 'PATCH', { dailyReminder: false });
    const form = await apiCall('/esbeu-assessments/form');
    const context = (await json(ai, '/v1/examples')).prediction_request.context;
    const initial = await apiCall('/esbeu-assessments', 'POST', { context, consent: true, adult: true, enrolled: true, consentVersion: form.consent.version });
    const today = (await apiCall('/daily-check-ins/overview')).today;
    const days = [];
    for (let offset = -13; offset < 0; offset++) {
      const positive = offset >= -6 || offset === -12;
      days.push(await apiCall('/daily-check-ins', 'PUT', { date: shift(today, offset), mood: positive ? 'Calmo' : 'Cansado',
        sleepHours: positive ? 8 : 5, observations: positive ? good : poor }));
    }
    check('retroactive registrations do not mark today complete', !(await apiCall('/daily-check-ins/overview')).todayCheckIn);
    const priorIndex = (await apiCall('/esbeu-assessments/current')).assessment;
    const guided = await apiCall('/esbeu-assessments/guided-review', 'POST', { topic: 'apoio', sourceAssessmentId: priorIndex.id, confirmed: true, changes: { academic_support: 3 } });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(({ accessToken, refreshToken }) => {
      localStorage.setItem('burnoutsense.auth.accessToken', accessToken);
      localStorage.setItem('burnoutsense.auth.refreshToken', refreshToken);
    }, { accessToken: auth.accessToken, refreshToken: auth.refreshToken });
    page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(web + '/registro');
    await page.locator('#check-in-date').click();
    const calendar = page.getByRole('dialog', { name: 'Selecionar data', exact: true });
    await calendar.getByRole('button', { name: 'Mês', exact: true }).click();
    check('calendar has themed month choices', await calendar.getByRole('listbox', { name: 'Mês', exact: true }).getByRole('option').count() === 12);
    check('calendar month labels fit their options', await calendar.getByRole('listbox').getByRole('option').evaluateAll(options => options.every(option => option.scrollWidth <= option.clientWidth + 1)));
    await page.screenshot({ path: path.join(output, 'calendar-months.png') });
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    check('custom month selector navigates the calendar', /janeiro/i.test(await calendar.getByRole('button', { name: 'Mês', exact: true }).innerText()));
    await calendar.getByRole('button', { name: 'Ano', exact: true }).click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    check('custom year selector supports keyboard navigation', (await calendar.getByRole('button', { name: 'Ano', exact: true }).innerText()).includes(String(Number(today.slice(0, 4)) - 1)));
    await calendar.getByRole('button', { name: 'Ano', exact: true }).click();
    await page.keyboard.press('Escape');
    check('escape closes calendar choices without closing the date dialog', await calendar.isVisible() && await calendar.getByRole('listbox').count() === 0);
    await calendar.getByRole('button', { name: 'Hoje', exact: true }).click();
    await page.getByRole('radio', { name: 'Calmo', exact: true }).check();
    await page.locator('#daily-sleep').fill('8.5');
    await page.locator('[name="sleep_quality"][value="3"]').check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    for (const [key, value] of Object.entries({ assessment_pressure: 2, study_rest_difficulty: 1, personal_support: 3 })) await page.locator('[name="' + key + '"][value="' + value + '"]').check();
    await page.getByRole('button', { name: 'Salvar meu dia' }).click();
    await page.waitForURL('**/dashboard');
    await page.locator('.app-notice').getByText('Check-in salvo', { exact: true }).waitFor();
    check('dashboard removes current-index card and recent-index section', await page.getByRole('heading', { name: 'Seu índice atual', exact: true }).count() === 0 && await page.getByRole('heading', { name: 'Atualizações recentes do índice' }).count() === 0);
    await page.getByRole('heading', { name: 'Que bom ver essa melhora!' }).waitFor();
    check('routine icon aligns to the left of its title', await page.locator('.routine-feedback-title').evaluate(el => {
      const icon = el.querySelector('.routine-feedback-icon').getBoundingClientRect();
      const title = el.querySelector('h2').getBoundingClientRect();
      return icon.right <= title.left && Math.abs(icon.top + icon.height / 2 - title.top - title.height / 2) < 2;
    }));
    check('feedback is inline and no modal opens', await page.locator('dialog[open]').count() === 0);
    check('weekly default', await page.getByRole('button', { name: 'Semanal', exact: true }).getAttribute('aria-pressed') === 'true');
    await page.getByRole('button', { name: 'Diário', exact: true }).focus();
    await page.keyboard.press('Space');
    check('daily keyboard selection', await page.getByRole('button', { name: 'Diário', exact: true }).getAttribute('aria-pressed') === 'true');
    await page.getByRole('button', { name: 'Mensal', exact: true }).click();
    await page.getByRole('button', { name: 'Semanal', exact: true }).click();
    await page.locator('.app-notice').waitFor({ state: 'hidden', timeout: 7000 });
    await page.reload();
    await page.getByRole('heading', { name: 'Evolução do acompanhamento' }).waitFor();
    check('completion toast is consumed, not fixed or replayed', await page.locator('.app-notice').count() === 0);
    const summaryBox = await page.locator('.tracking-summary').boundingBox();
    const chartBox = await page.locator('.index-chart').boundingBox();
    check('desktop chart fits next to daily tracking', chartBox.x > summaryBox.x + summaryBox.width && chartBox.width < 750);
    check('redundant routine update block is absent', await page.getByText('Atualize seu acompanhamento', { exact: true }).count() === 0);
    check('review check-in uses a styled button', await page.getByRole('link', { name: 'Revisar check-in', exact: true }).evaluate(el => getComputedStyle(el).borderTopStyle === 'solid' && el.classList.contains('button')));
    check('routine feedback has a full border', await page.locator('.routine-feedback').evaluate(el => getComputedStyle(el).borderRightStyle === 'solid' && parseFloat(getComputedStyle(el).borderRadius) > 0));
    await page.screenshot({ path: path.join(output, 'dashboard-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: 'O que mudou na rotina?', exact: true }).click();
    await page.getByRole('heading', { name: 'O que mudou na sua rotina?' }).waitFor();
    check('inline feedback opens the topic picker', await page.locator('.review-topic').count() === 4);
    check('topic picker and actions are centered in the content area', await page.locator('.review-topic-picker').evaluate(el => {
      const picker = el.getBoundingClientRect();
      const main = el.closest('.main').getBoundingClientRect();
      return Math.abs(picker.left + picker.width / 2 - main.left - main.width / 2) < 2
        && getComputedStyle(el.querySelector('.review-picker-actions')).justifyContent === 'center';
    }));
    await page.screenshot({ path: path.join(output, 'review-picker-desktop.png'), fullPage: true });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: path.join(output, 'review-picker-desktop-dark.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check('mobile topic picker has no overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'review-picker-mobile-dark.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 700 });
    check('small topic picker text fits each card', await page.locator('.review-topic').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1)));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = ''; });
    const updated = await apiCall('/daily-check-ins', 'PUT', { date: days[0].date.slice(0, 10), mood: 'Cansado', sleepHours: 5.25, observations: poor });
    check('editing preserves identity and original registration', updated.id === days[0].id && updated.createdAt === days[0].createdAt && updated.updatedAt !== updated.createdAt);
    const list = (await apiCall('/esbeu-assessments')).items;
    const origins = list.filter((r) => r.triggerCheckIn?.id === days[0].id);
    check('origin metadata uses reference day, not calculation day', origins.length > 0 && origins.every((r) => r.triggerCheckIn.date.slice(0, 10) === days[0].date.slice(0, 10)));
    const survivor = list.find((r) => r.triggerCheckIn?.id === days[1].id);
    assert.ok(survivor);
    const foreign = await account();
    check('another owner cannot delete a check-in', (await request(api, '/daily-check-ins/' + days[1].id, 'DELETE', undefined, foreign.accessToken)).status === 404);
    await page.goto(web + '/historico');
    await page.getByRole('tab', { name: 'Índices e rotina' }).click();
    await page.getByText('Dia do check-in:', { exact: false }).first().waitFor();
    check('history table omits the complementary column', await page.getByRole('columnheader', { name: 'Complementar', exact: true }).count() === 0 && await page.locator('.esbeu-table thead th').count() === 3);
    await page.screenshot({ path: path.join(output, 'indices-dates.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Check-ins diários' }).click();
    check('daily history dates share the check-in header', await page.locator('.daily-history-item header .daily-history-dates').first().innerText().then(text => text.includes('Registrado em')));
    await page.screenshot({ path: path.join(output, 'daily-history-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check('mobile daily history has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'daily-history-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const target = page.locator('article.daily-history-item').filter({ has: page.locator('time[datetime^="' + days[0].date.slice(0, 10) + '"]') });
    await target.getByRole('button', { name: /^Excluir check-in/ }).click();
    await page.getByRole('dialog', { name: 'Excluir este check-in?' }).getByRole('button', { name: 'Confirmar exclusão' }).click();
    await target.waitFor({ state: 'hidden' });
    const after = (await apiCall('/esbeu-assessments')).items;
    const series = await apiCall('/esbeu-assessments/trend');
    check('deletion removes only directly linked index records from history and chart', origins.every((old) => !after.some((r) => r.id === old.id) && !series.some((r) => r.id === old.id)));
    check('other check-in indices, initial context and guided review survive deletion', [survivor.id, initial.id, guided.id].every((id) => after.some((r) => r.id === id)));
    check('deleted index details are unavailable', (await request(api, '/esbeu-assessments/' + origins[0].id)).status === 404);
    const current = (await apiCall('/esbeu-assessments/current')).assessment;
    const predicted = await json(ai, '/v1/predict', 'POST', { context: current.context });
    check('remaining evidence uses unchanged RF/A', Math.abs(current.estimatedOverall - predicted.esbeu_overall) < 1e-10);
    await page.goto(web + '/perfil');
    await page.getByRole('tab', { name: 'Notificações', exact: false }).click();
    await page.route('**/notifications/test', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Teste visual de lembrete concluído.', dailyReminder: { status: 'sent' } }) }));
    await page.getByRole('button', { name: 'Testar lembrete', exact: true }).click();
    await page.locator('.toast').getByText('Teste visual de lembrete concluído.', { exact: true }).waitFor();
    check('reminder test result only appears in one toast', await page.getByText('Teste visual de lembrete concluído.', { exact: true }).count() === 1 && await page.locator('.notification-test-result').count() === 0);
    const reminder = page.locator('.switch input');
    await page.locator('.switch').click();
    check('reminder switch can be enabled', await reminder.isChecked());
    check('reminder preference is not autosaved', (await apiCall('/users/me')).dailyReminder === false);
    let save = page.waitForResponse((r) => r.url().endsWith('/users/me') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Salvar alterações' }).click(); assert.ok((await save).ok());
    check('reminder preference changes only after save', (await apiCall('/users/me')).dailyReminder === true);
    await page.locator('.switch').click();
    check('reminder switch can be disabled', !await reminder.isChecked());
    save = page.waitForResponse((r) => r.url().endsWith('/users/me') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Salvar alterações' }).click(); await save;
    check('only daily reminder is offered', await page.getByText('Alertas por e-mail', { exact: true }).count() === 0);
    await page.getByRole('tab', { name: 'Preferências', exact: false }).click();
    await page.getByRole('button', { name: /Escuro/ }).click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.goto(web + '/dashboard');
    await page.getByRole('heading', { name: 'Evolução do acompanhamento' }).waitFor();
    await page.screenshot({ path: path.join(output, 'dashboard-desktop-dark.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Evolução do acompanhamento' }).waitFor();
    await page.waitForTimeout(250);
    check('mobile has no page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'dashboard-mobile-dark.png'), fullPage: true });
    await page.goto(web + '/registro');
    await page.locator('#check-in-date').click();
    await calendar.getByRole('button', { name: 'Mês', exact: true }).click();
    check('mobile calendar has no horizontal overflow', await calendar.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: path.join(output, 'calendar-mobile-dark.png') });
    await page.setViewportSize({ width: 320, height: 700 });
    check('small calendar month labels remain within their options', await calendar.getByRole('listbox').getByRole('option').evaluateAll(options => options.every(option => option.scrollWidth <= option.clientWidth + 1)));
    check('small calendar fits its dialog', await calendar.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    check('no browser runtime errors', errors.length === 0);
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(checks, null, 2));
    console.log(JSON.stringify({ checks, screenshotDirectory: output }));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    for (const account of accounts) {
      const response = await request(api, '/users/me', 'DELETE', undefined, account.accessToken);
      assert.ok(response.ok, 'Failed to clean up fictional account');
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
