// Opt-in local RF/A integration check. Only the fictional test account is removed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const cfg = createRequire(require.resolve('@nestjs/config'))('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
  for (const url of [cfg.DATABASE_URL, cfg.AI_SERVICE_URL]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
  assert.notEqual(cfg.NODE_ENV, 'production');
  const checks = [], api = 'http://localhost:3001', output = path.join(root, '.run-logs/check-in-chronology');
  fs.mkdirSync(output, { recursive: true });
  let auth, browser;
  const check = (label, value) => { assert.ok(value, label); checks.push(label); };
  async function json(route, method = 'GET', body) {
    const response = await fetch(api + route, { method, signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth.accessToken } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    assert.ok(response.ok, route + ': HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  }
  const current = async () => (await json('/esbeu-assessments/current')).assessment;
  const shift = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const poor = { sleep_quality: 1, assessment_pressure: 4, study_rest_difficulty: 3, personal_support: 1 };
  const good = { sleep_quality: 3, assessment_pressure: 1, study_rest_difficulty: 1, personal_support: 3 };
  try {
    const tag = randomBytes(8).toString('hex');
    auth = await json('/auth/register', 'POST', { name: 'Teste fictício de ordem dos dias', email: 'qa-order-' + tag + '@example.invalid', password: 'Teste1' + tag });
    await json('/users/me', 'PATCH', { dailyReminder: false });
    const ready = await fetch(cfg.AI_SERVICE_URL + '/ready', { headers: { 'X-API-Key': cfg.AI_SERVICE_API_KEY } });
    check('real RF/A is ready', ready.ok);
    const example = await (await fetch(cfg.AI_SERVICE_URL + '/v1/examples', { headers: { 'X-API-Key': cfg.AI_SERVICE_API_KEY } })).json();
    const form = await json('/esbeu-assessments/form');
    await json('/esbeu-assessments', 'POST', { context: example.prediction_request.context, adult: true, enrolled: true, consent: true, consentVersion: form.consent.version });
    const today = (await json('/daily-check-ins/overview')).today;
    const save = (date, sleepHours, observations) => json('/daily-check-ins', 'PUT', { date, mood: 'Calmo', sleepHours, observations });
    check('yesterday can calculate when no newer check-in exists', (await save(shift(today, -1), 4, poor)).indexUpdate.status === 'updated');
    check('today saved after yesterday calculates normally', (await save(today, 8, good)).indexUpdate.status === 'updated');
    const stable = await current();
    check('28-day mean is preserved', stable.context.sleep_hours === 6);
    check('older creation is history-only', (await save(shift(today, -2), 2, poor)).indexUpdate.status === 'historical');
    check('older edit is history-only', (await save(shift(today, -1), 3, poor)).indexUpdate.status === 'historical');
    check('older saves keep both current ID and score', (await current()).id === stable.id && (await current()).estimatedOverall === stable.estimatedOverall);
    check('historical changes alone are not pending', !(await json('/daily-check-ins/overview')).evolution.pending);
    check('retry does not bypass the historical rule', (await json('/daily-check-ins/recalculate', 'POST')).status === 'unchanged' && (await current()).id === stable.id);
    check('newest-day edit recalculates with earlier eligible evidence', (await save(today, 9, good)).indexUpdate.status === 'updated');
    check('deferred older evidence joins next average', (await current()).context.sleep_hours === 4.667);
    const last = await current();
    const duplicate = await save(today, 9, good);
    check('unchanged inputs do not duplicate the index', duplicate.indexUpdate.status === 'unchanged' && (await current()).id === last.id);
    const revision = (await json('/daily-check-ins/day/' + today)).checkIn;
    check('processing acknowledgment does not fake a user edit', revision.updatedAt === revision.indexProcessedRevision);
    await save(shift(today, -2), 1, poor);
    check('historical save after an unchanged newest day is not pending', !(await json('/daily-check-ins/overview')).evolution.pending);
    check('historical save after unchanged inputs cannot be retried into a new index', (await json('/daily-check-ins/recalculate', 'POST')).status === 'unchanged');
    for (let offset = -13; offset <= 0; offset++) {
      const positive = offset >= -6;
      await save(shift(today, offset), positive ? 7 + (offset + 6) % 3 / 2 : 4 + (offset + 13) % 3 / 2,
        positive ? { ...good, sleep_quality: offset % 2 === 0 ? 4 : 3 } : { ...poor, assessment_pressure: offset % 2 === 0 ? 3 : 4 });
    }
    const overview = await json('/daily-check-ins/overview');
    check('14 distinct recent days are available', overview.completedDays === 14);
    const final = await current();
    const prediction = await (await fetch(cfg.AI_SERVICE_URL + '/v1/predict', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.AI_SERVICE_API_KEY }, body: JSON.stringify({ context: final.context }) })).json();
    check('final index matches unchanged RF/A', Math.abs(final.estimatedOverall - prediction.esbeu_overall) < 1e-10);
    if (process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE) {
      const { chromium } = require(process.env.BURNOUTSENSE_PLAYWRIGHT_MODULE);
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      await context.addInitScript(tokens => {
        localStorage.setItem('burnoutsense.auth.accessToken', tokens.accessToken);
        localStorage.setItem('burnoutsense.auth.refreshToken', tokens.refreshToken);
      }, auth);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://localhost:3000/dashboard');
      await page.getByRole('heading', { name: 'Que bom ver essa melhora!', exact: true }).waitFor();
      check('dashboard shows the 7 plus 7 comparison', await page.getByText('Seus 7 check-ins mais recentes em comparação com os 7 anteriores', { exact: true }).isVisible());
      await page.screenshot({ path: path.join(output, 'weekly-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      check('weekly comparison fits mobile', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'weekly-mobile.png'), fullPage: true });
      check('no browser runtime errors', errors.length === 0);
    }
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, output }));
  } finally {
    if (browser) await browser.close();
    if (auth) await json('/users/me', 'DELETE');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
