import { aggregateContext, contextKey } from './context-aggregation';

const baseline = { sleep_hours: 8, sleep_quality: 4, assessment_pressure: 0, study_rest_difficulty: 0, personal_support: 4, age_range: '21 a 23 anos', subject_overload: 2 };
const row = (id: string, sleep: number, rating: number) => ({ id, date: new Date(`2026-11-0${id}T00:00:00Z`), updatedAt: new Date('2026-11-04T10:00:00Z'), sleepHours: sleep,
  observations: { sleep_quality: rating, assessment_pressure: rating, study_rest_difficulty: rating, personal_support: rating } });

describe('Explicit experimental daily-window adapter', () => {
  it('uses the available observations immediately without inventing 27 other days', () => {
    const result = aggregateContext(baseline, [row('1', 5, 1)]);
    expect(result.context.sleep_hours).toBe(5); expect(result.context.sleep_quality).toBe(1);
    expect(result.recordedDays).toBe(1); expect(result.context.subject_overload).toBe(2);
    expect(result.carriedFields).toContain('age_range');
    expect(baseline.sleep_hours).toBe(8);
  });
  it('averages observed days only, rounds ordinal inputs and never compounds a previous prediction', () => {
    const result = aggregateContext(baseline, [row('1', 5, 1), row('2', 8, 4)]);
    expect(result.context.sleep_hours).toBe(6.5); expect(result.context.sleep_quality).toBe(3);
    expect(result.recordedDays).toBe(2); expect(result.evidence).toHaveLength(2);
    expect(result.methods.ordinal).toBe('arithmetic_mean_rounded_half_up');
  });
  it('does not reinterpret legacy energy, mood or generic demand as model predictors', () => {
    const result = aggregateContext(baseline, [{ ...row('1', 5, 1), observations: null }]);
    expect(result.context).toEqual(baseline); expect(result.recordedDays).toBe(0);
    expect(aggregateContext(baseline, []).context).toEqual(baseline);
  });
  it('keeps input equivalence independent of object property order', () => {
    expect(contextKey({ a: 0, b: 'Não se aplica' })).toBe(contextKey({ b: 'Não se aplica', a: 0 }));
  });
});
