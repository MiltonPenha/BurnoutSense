// Read-only inference audit. No database client, private model loading or fitting.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const hypotheses = {
  sleep_quality: -1, subject_overload: 1, assessment_pressure: 1,
  extraclass_overload: 1, study_rest_difficulty: 1, study_work_difficulty: 1,
  teacher_difficulties: 1, peer_difficulties: 1, personal_support: -1,
  academic_support: -1, financial_concern: 1,
};
const grids = {
  semester: Array.from({ length: 12 }, (_, i) => i + 1),
  subject_count: Array.from({ length: 16 }, (_, i) => i),
  mandatory_hours_week: [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60],
  independent_hours_week: [0, 5, 10, 15, 20, 25, 30, 40],
  work_hours_week: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60],
  sleep_hours: [3, 4, 5, 6, 7, 8, 9, 10],
};
const EPS = 0.01;
const round = (n) => Number(n.toFixed(5));

function analyzeCurve(points, direction = null, ordered = true) {
  const accepted = points.filter((p) => p.status === 'ok');
  const comparisons = [];
  // Do not bridge rejected/skipped points when checking neighboring levels.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.status !== 'ok' || b.status !== 'ok' || !ordered) continue;
    comparisons.push({ from: a.value, to: b.value, delta: round(b.index - a.index) });
  }
  const values = accepted.map((p) => p.index);
  const reversed = direction === null ? [] : comparisons.filter((p) => p.delta * direction < -EPS);
  return {
    range: values.length ? round(Math.max(...values) - Math.min(...values)) : null,
    maxStep: comparisons.length ? round(Math.max(...comparisons.map((p) => Math.abs(p.delta)))) : null,
    reversed, comparedSteps: direction === null ? 0 : comparisons.length,
    flat: values.length > 1 && Math.max(...values) - Math.min(...values) < EPS,
  };
}

function coherent(context) {
  if (context.employment === 'Não, apenas estudo') {
    if (context.work_hours_week !== 0 || context.study_work_difficulty !== 'Não se aplica') return false;
  } else if (context.work_hours_week <= 0 || context.study_work_difficulty === 'Não se aplica') return false;
  // This extra audit constraint is not a new model rule.
  return context.mandatory_hours_week + context.independent_hours_week +
    context.work_hours_week + 7 * context.sleep_hours <= 147;
}

function fixtures(example) {
  const result = [];
  for (const burden of [0, 2, 4]) for (const employed of [false, true]) {
    const context = { ...example, age_range: '21 a 23 anos', course_area: 'Engenharias e Tecnologia',
      semester: 4, course_shift: 'Noturno', subject_count: 5, mandatory_hours_week: 20,
      independent_hours_week: 8, employment: employed ? 'Sim, estágio' : 'Não, apenas estudo',
      work_hours_week: employed ? 30 : 0, study_work_difficulty: employed ? burden : 'Não se aplica',
      sleep_hours: burden === 0 ? 8 : burden === 2 ? 6.5 : 4,
      sleep_quality: 4 - burden, physical_activity_days: burden === 4 ? '0 dias' : '3 dias',
      subject_overload: burden, assessment_pressure: burden, extraclass_overload: burden,
      study_rest_difficulty: burden, teacher_difficulties: burden, peer_difficulties: burden,
      personal_support: 4 - burden, academic_support: 4 - burden, financial_concern: burden };
    assert.ok(coherent(context));
    result.push({ id: ['menor', 'intermediaria', 'maior'][burden / 2] + (employed ? '-estagio' : '-estudo'), context });
  }
  return result;
}

const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const display = (n) => n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function renderHtml(report) {
  const body = report.fields.map((field) => {
    const curves = field.curves.map((curve) => '<details><summary>' + escape(curve.baseline) + ' · amplitude ' + display(curve.range) + ' p.p.</summary><div class="table-scroll"><table><thead><tr><th>Resposta</th><th>Índice</th><th>Variação em relação à base</th></tr></thead><tbody>' +
      curve.points.map((p) => '<tr><td>' + escape(p.value) + '</td><td>' + (p.status === 'ok' ?
        display(p.index) + '% <span class="track"><i style="width:' + p.index + '%"></i></span>' : escape(p.status)) +
        '</td><td>' + (p.status === 'ok' ? display(p.delta) + ' p.p.' : '—') + '</td></tr>').join('') +
      '</tbody></table></div></details>').join('');
    return '<section id="' + escape(field.id) + '"><h2>' + escape(field.name) + '</h2><p><code>' + escape(field.id) +
      '</code> · amplitude máxima: <strong>' + display(field.maxRange) + ' p.p.</strong> · ' +
      (field.hypothesis === null ? 'Sem direção normativa assumida.' : 'Hipótese de auditoria: valores maiores → índice ' + (field.hypothesis > 0 ? 'maior' : 'menor') + '.') +
      (field.coupled ? ' Vínculo varia junto com horas e aplicabilidade; não é efeito isolado.' : '') + '</p>' + curves + '</section>';
  }).join('');
  const rows = report.fields.map((f) => '<tr><td><a href="#' + escape(f.id) + '">' + escape(f.name) + '</a></td><td>' + display(f.maxRange) +
    '</td><td>' + display(f.maxStep) + '</td><td>' + (f.hypothesis === null ? 'Não avaliada' : f.reverseSteps + ' / ' + f.comparedSteps) + '</td><td>' + f.flatCurves + '</td></tr>').join('');
  return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BurnoutSense · Auditoria RF/A</title>' +
    '<style>*{box-sizing:border-box}body{font:15px/1.55 system-ui,sans-serif;color:#152b3c;background:#f5f9fb;margin:0}main{max-width:1140px;margin:auto;padding:28px 20px}h1{font-size:27px;margin:0}h2{font-size:19px}a{color:#126ab4}p{max-width:95ch}code{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce6ec}th{background:#edf4f8}section{padding:22px 0;border-top:1px solid #cedde6}details{background:white;border:1px solid #dce6ec;border-radius:6px;padding:10px 14px;margin:8px 0}summary{cursor:pointer;font-weight:600}.table-scroll{overflow:auto}.track{display:inline-block;vertical-align:middle;width:100px;height:6px;background:#e3edf5;margin-left:10px}.track i{display:block;height:100%;background:#60a5fa}.notice{padding:14px;border-left:3px solid #34d399;background:white}small{color:#526675}@media(max-width:600px){main{padding:20px 12px}th,td{padding:8px}.track{display:none}}</style>' +
    '<main><header><small>' + escape(report.createdAt) + '</small><h1>Auditoria de sensibilidade do RF/A</h1><p>' + report.requests +
    ' chamadas · 6 contextos fictícios · 22 variáveis · nenhuma conta ou treinamento alterado.</p></header>' +
    '<p class="notice">Os sinais abaixo são diagnósticos de comportamento, não erros comprovados, pesos causais ou validação clínica. Hipóteses direcionais são regras de investigação e não foram impostas ao modelo. A amplitude não é uma importância global. Os perfis são hipotéticos, sem confirmação de representatividade na amostra.</p>' +
    '<p>Modelo <code>' + escape(report.model.model_version) + '</code>. Faixa observada nesta grade: <strong>' + display(report.minIndex) + '% a ' + display(report.maxIndex) +
    '%</strong>. Isso não demonstra os limites globais do modelo. Categorias nominais não têm ordem de melhor/pior. Sono e horas são exploratórios; não se assume que mais seja sempre melhor ou pior.</p>' +
    '<div class="table-scroll"><table><thead><tr><th>Variável</th><th>Amplitude máx. (p.p.)</th><th>Maior passo (p.p.)</th><th>Passos contrários à hipótese</th><th>Perfis sem variação</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + body +
    '<section><h2>Controles</h2><pre>' + escape(JSON.stringify(report.controls, null, 2)) + '</pre><p>Os arquivos audit.json e predictions.csv contêm os valores e as rejeições. Os campos não testados de cada curva ficam iguais aos da base, exceto o teste acoplado de vínculo. A categoria Não se aplica não é zero.</p></section></main></html>';
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const cfgFile = path.join(root, 'backend/.env');
  const dotenv = createRequire(require.resolve('@nestjs/config'))('dotenv');
  const cfg = dotenv.parse(fs.readFileSync(cfgFile));
  const ai = new URL(cfg.AI_SERVICE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(ai.hostname), 'Use apenas o RF/A local.');
  const output = path.join(root, '.run-logs/rfa-sensitivity');
  let requests = 0;
  const records = [];
  async function request(route, body) {
    requests++;
    const response = await fetch(new URL(route, ai), {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.AI_SERVICE_API_KEY },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 422) return { rejected: true };
    if (!response.ok) throw new Error(route + ': HTTP ' + response.status);
    return response.json();
  }
  const model = await request('/v1/model');
  assert.equal(model.model_name, 'random_forest');
  assert.equal(model.dataset_version, 'rf-a-candidate-v1');
  const schema = await request('/v1/schema');
  const example = (await request('/v1/examples')).prediction_request.context;
  assert.equal(model.predictors.length, 22);
  const fields = schema.fields.filter((f) => model.predictors.includes(f.identifier));
  assert.equal(fields.length, 22);
  const bases = fixtures(example);
  async function score(context) {
    const p = await request('/v1/predict', { context });
    if (p.rejected) return null;
    assert.equal(p.model_version, model.model_version, 'O artefato mudou durante a auditoria.');
    assert.ok(Number.isFinite(p.esbeu_overall) && p.esbeu_overall >= 0 && p.esbeu_overall <= 4);
    return p.esbeu_overall * 25;
  }
  for (const base of bases) base.index = await score(base.context);
  assert.ok(bases.every((base) => base.index !== null));
  const definitions = [];
  for (const field of fields) {
    const id = field.identifier;
    const curves = [];
    for (const base of bases) {
      let values = grids[id] ?? field.choices;
      if (id === 'work_hours_week' && base.context.employment === 'Não, apenas estudo') values = [0];
      if (id === 'study_work_difficulty' && base.context.employment === 'Não, apenas estudo') values = ['Não se aplica'];
      const points = [];
      for (const value of values) {
        const context = { ...base.context, [id]: value };
        if (id === 'employment') {
          const working = value !== 'Não, apenas estudo';
          context.work_hours_week = working ? 30 : 0;
          context.study_work_difficulty = working ? 2 : 'Não se aplica';
        }
        if (!coherent(context)) { points.push({ value, status: 'skipped_coherence' }); continue; }
        const predicted = await score(context);
        const point = predicted === null ? { value, status: 'rejected_422' }
          : { value, status: 'ok', index: predicted, delta: round(predicted - base.index) };
        points.push(point);
        records.push({ field: id, baseline: base.id, ...point });
      }
      const ordered = id !== 'employment' && (field.data_type !== 'category' || ['age_range', 'physical_activity_days'].includes(id));
      const hypothesis = hypotheses[id] ?? null;
      curves.push({ baseline: base.id, baseIndex: base.index, points, ...analyzeCurve(points, hypothesis, ordered) });
    }
    definitions.push({
      id, name: field.name, hypothesis: hypotheses[id] ?? null, coupled: id === 'employment', curves,
      maxRange: Math.max(...curves.filter((c) => c.range !== null).map((c) => c.range)),
      maxStep: curves.some((c) => c.maxStep !== null) ? Math.max(...curves.filter((c) => c.maxStep !== null).map((c) => c.maxStep)) : null,
      reverseSteps: curves.reduce((sum, c) => sum + c.reversed.length, 0),
      comparedSteps: curves.reduce((sum, c) => sum + c.comparedSteps, 0),
      flatCurves: curves.filter((c) => c.flat).length,
    });
    process.stdout.write(id + ': ok\n');
  }
  const workMatrix = [];
  for (const base of bases.filter((b) => b.id.endsWith('-estagio'))) {
    for (const employment of fields.find((f) => f.identifier === 'employment').choices.slice(1)) {
      for (const hours of [10, 20, 30, 40, 50]) for (const difficulty of [0, 1, 2, 3, 4]) {
        const context = { ...base.context, employment, work_hours_week: hours, study_work_difficulty: difficulty };
        if (!coherent(context)) continue;
        workMatrix.push({ baseline: base.id, employment, hours, difficulty, index: await score(context) });
      }
    }
  }
  const reference = bases[2].context;
  const repeated = [];
  for (let i = 0; i < 10; i++) repeated.push(await score(reference));
  const reversedOrder = await score(Object.fromEntries(Object.entries(reference).reverse()));
  const controls = {
    repeatedSpread: Math.max(...repeated) - Math.min(...repeated),
    keyOrderDifference: Math.abs(reversedOrder - repeated[0]),
    extraFieldRejected: (await request('/v1/predict', { context: { ...reference, audit_extra: 1 } })).rejected === true,
    missingFieldRejected: (await request('/v1/predict', { context: Object.fromEntries(Object.entries(reference).filter(([key]) => key !== 'sleep_hours')) })).rejected === true,
    invalidRatingRejected: (await request('/v1/predict', { context: { ...reference, sleep_quality: 9 } })).rejected === true,
    inconsistentEmploymentRejected: (await request('/v1/predict', { context: { ...reference, employment: 'Não, apenas estudo', work_hours_week: 30 } })).rejected === true,
  };
  const predictions = [...bases.map((b) => b.index), ...records.filter((r) => r.status === 'ok').map((r) => r.index), ...workMatrix.filter((r) => r.index !== null).map((r) => r.index)];
  const report = {
    createdAt: new Date().toISOString(), requests,
    scope: 'synthetic_local_sensitivity_not_validation_or_causality',
    model: { model_version: model.model_version, dataset_version: model.dataset_version, training_records: model.training_records },
    minIndex: Math.min(...predictions), maxIndex: Math.max(...predictions),
    rejected: records.filter((r) => r.status !== 'ok').length,
    skippedCoherence: definitions.reduce((sum, f) => sum + f.curves.reduce((total, c) => total + c.points.filter((p) => p.status === 'skipped_coherence').length, 0), 0),
    bases, fields: definitions, workMatrix, controls,
  };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'report.html'), renderHtml(report));
  const csv = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  fs.writeFileSync(path.join(output, 'predictions.csv'), ['field,baseline,value,status,index,delta', ...records.map((r) => [r.field, r.baseline, r.value, r.status, r.index, r.delta].map(csv).join(','))].join('\n'));
  const sorted = [...definitions].sort((a, b) => b.maxRange - a.maxRange);
  const md = ['# Auditoria local de sensibilidade RF/A', '',
    'Somente inferência em perfis fictícios. Sem banco, retreinamento ou alteração de parâmetros.',
    'Hipóteses de direção não são leis causais nem critérios clínicos. Amplitude não é importância global.',
    '', 'Chamadas: ' + requests + '. Faixa observada: ' + round(report.minIndex) + '% a ' + round(report.maxIndex) + '%.',
    '', '| Campo | Amplitude máxima (p.p.) | Maior passo (p.p.) | Passos contrários à hipótese |',
    '|---|---:|---:|---:|',
    ...sorted.map((f) => '| ' + f.id + ' | ' + round(f.maxRange) + ' | ' + (f.maxStep === null ? '—' : round(f.maxStep)) + ' | ' + (f.hypothesis === null ? 'Não avaliado' : f.reverseSteps + '/' + f.comparedSteps) + ' |'),
    '', '## Controles', '', '```json', JSON.stringify(controls, null, 2), '```',
    '', 'Detalhes por perfil e resposta: report.html e audit.json. O teste de vínculo altera também jornada/aplicabilidade.',
    'Faixas numéricas são uma grade exploratória, não busca exaustiva do domínio ou confirmação de cobertura no treino.'];
  fs.writeFileSync(path.join(output, 'summary.md'), md.join('\n'));
  console.log(JSON.stringify({ output, requests, min: report.minIndex, max: report.maxIndex, controls, ranking: sorted.map(({ id, maxRange, maxStep, reverseSteps, comparedSteps, flatCurves }) => ({ id, maxRange, maxStep, reverseSteps, comparedSteps, flatCurves })) }));
}

module.exports = { analyzeCurve, coherent, fixtures };
if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
