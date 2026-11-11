import type { ObservationDraft } from "./types";

export function validateDailyAnswers(draft: { mood: string; sleepHours: string; observations: ObservationDraft }, complete: boolean) {
  const errors: Record<string, string> = {};
  const normalized = draft.sleepHours.trim().replace(",", ".");
  const sleepHours = Number(normalized);
  if (!draft.mood) errors.mood = "Escolha como você se sentiu nesse dia.";
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) || !Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24) errors.sleepHours = "Informe entre 0 e 24 horas. Você pode usar vírgula, como 7,5.";
  const keys = complete ? ["sleep_quality", "assessment_pressure", "study_rest_difficulty", "personal_support"] as const : ["sleep_quality"] as const;
  for (const key of keys) {
    const value = draft.observations[key];
    if (value === "" || !Number.isInteger(value) || value < 0 || value > 4) errors[key] = "Selecione uma resposta para esta pergunta.";
  }
  return { errors, sleepHours };
}
