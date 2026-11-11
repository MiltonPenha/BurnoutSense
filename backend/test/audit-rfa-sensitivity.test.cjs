const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeCurve, coherent } = require('./audit-rfa-sensitivity.cjs');
const points = (values) => values.map((index, value) => ({ value, index, status: 'ok' }));

test('hypotheses are explicit and flat curves do not imply prediction errors', () => {
  assert.equal(analyzeCurve(points([30, 40, 20]), 1).reversed.length, 1);
  assert.equal(analyzeCurve(points([30, 40, 20]), null).reversed.length, 0);
  assert.equal(analyzeCurve(points([30, 30, 30]), 1).flat, true);
  assert.equal(analyzeCurve(points([30, 40, 20]), 1, false).maxStep, null);
});

test('rejected points are not bridged as neighboring levels', () => {
  assert.equal(analyzeCurve([points([30])[0], { status: 'rejected_422' }, points([20])[0]], 1).comparedSteps, 0);
});

test('coherence checks keep NA separate from numeric zero and budget time', () => {
  const base = { employment: 'Não, apenas estudo', work_hours_week: 0, study_work_difficulty: 'Não se aplica',
    mandatory_hours_week: 20, independent_hours_week: 8, sleep_hours: 8 };
  assert.equal(coherent(base), true);
  assert.equal(coherent({ ...base, study_work_difficulty: 0 }), false);
  assert.equal(coherent({ ...base, mandatory_hours_week: 120 }), false);
});
