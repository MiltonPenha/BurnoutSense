export const reviewTopics = {
  demandas: {
    title: 'Estudos e prazos', description: 'Carga de aulas, estudos e atividades fora da sala.',
    fields: { subject_overload: 'Sobrecarga de disciplinas', extraclass_overload: 'Sobrecarga fora das aulas',
      mandatory_hours_week: 'Horas de aula e atividades obrigatórias', independent_hours_week: 'Horas de estudo fora das aulas' },
  },
  trabalho: {
    title: 'Trabalho ou estágio', description: 'Vínculo, jornada e conciliação com os estudos.',
    fields: { employment: 'Situação de trabalho ou estágio', work_hours_week: 'Jornada de trabalho ou estágio',
      study_work_difficulty: 'Conciliação de estudos e trabalho' },
  },
  apoio: {
    title: 'Relações e apoio', description: 'Convívio com professores e colegas e apoio na faculdade.',
    fields: { teacher_difficulties: 'Relação com professores', peer_difficulties: 'Relação com colegas',
      academic_support: 'Apoio no ambiente acadêmico' },
  },
  rotina: {
    title: 'Hábitos e finanças', description: 'Atividade física e preocupações financeiras.',
    fields: { physical_activity_days: 'Frequência de atividade física', financial_concern: 'Preocupações financeiras' },
  },
} as const;

export type ReviewTopicId = keyof typeof reviewTopics;
export const reviewTopicIds = Object.keys(reviewTopics) as ReviewTopicId[];
const week = 7 * 24 * 60 * 60 * 1000;

export function suggestReviewTopic(fullContextAt: Date, reviews: Partial<Record<ReviewTopicId, Date>>, employment: unknown, now: Date) {
  const confirmed = fullContextAt.getTime();
  const latest = Math.max(confirmed, ...Object.values(reviews).map((date) => date.getTime()));
  if (now.getTime() - latest < week) return null;
  const eligible = reviewTopicIds.filter((id) => id !== 'trabalho' || (
    typeof employment === 'string' && employment !== 'Não, apenas estudo'
  ));
  const confirmedAt = (id: ReviewTopicId) => Math.max(confirmed, reviews[id]?.getTime() ?? 0);
  return eligible.sort((a, b) => confirmedAt(a) - confirmedAt(b))[0] ?? null;
}
