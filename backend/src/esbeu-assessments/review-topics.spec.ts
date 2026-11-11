import { reviewTopics, suggestReviewTopic } from './review-topics';

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe('weekly topic suggestions', () => {
  it('waits one week after a full or guided review', () => {
    expect(suggestReviewTopic(day(1), {}, 'Não, apenas estudo', day(7))).toBeNull();
    expect(suggestReviewTopic(day(1), { apoio: day(10) }, 'Sim, estágio', day(16))).toBeNull();
    expect(suggestReviewTopic(day(1), { apoio: day(10) }, 'Sim, estágio', day(17))).toBe('demandas');
  });
  it('prioritizes older topics and only suggests work for applicable students', () => {
    const reviews = { demandas: day(2), apoio: day(3) };
    expect(suggestReviewTopic(day(1), reviews, 'Sim, estágio', day(11))).toBe('trabalho');
    expect(suggestReviewTopic(day(1), reviews, 'Não, apenas estudo', day(11))).toBe('rotina');
    expect(reviewTopics.trabalho.fields.employment).toBeDefined();
  });
  it('does not repeat any of the five short check-in fields', () => {
    const guided = Object.values(reviewTopics).flatMap(({ fields }) => Object.keys(fields));
    expect(new Set(guided).size).toBe(12);
    expect(guided).not.toEqual(expect.arrayContaining(['sleep_hours', 'sleep_quality', 'assessment_pressure', 'study_rest_difficulty', 'personal_support']));
    for (const key of ['sleep_hours', 'sleep_quality', 'assessment_pressure', 'study_rest_difficulty', 'personal_support']) expect(guided).not.toContain(key);
  });
});
