import type { DailyQuestion, IndexUpdate } from "./types";

export const energyLabels = ["Sem energia", "Baixa", "Média", "Boa", "Muito boa"];
export const demandLabels = ["Muito leve", "Leve", "Moderada", "Intensa", "Muito intensa"];
export const sleepQualityLabels = ["Muito ruim", "Ruim", "Regular", "Boa", "Muito boa"];

export const dailyQuestions: DailyQuestion[] = [
  { key: "sleep_quality", title: "Como foi a qualidade do seu sono?", labels: sleepQualityLabels },
  { key: "assessment_pressure", title: "Quanto as provas e os prazos pressionaram você?", labels: ["Nada", "Pouco", "Moderadamente", "Bastante", "Extremamente"] },
  { key: "study_rest_difficulty", title: "Foi difícil conciliar estudos e descanso?", labels: ["Nada", "Pouco", "Moderadamente", "Bastante", "Extremamente"] },
  { key: "personal_support", title: "Quanto apoio você sentiu de pessoas próximas?", labels: ["Nenhum", "Pouco", "Moderado", "Bastante", "Muito"] },
];

export function indexUpdateMessage(update?: IndexUpdate | null) {
  if (update?.status === "updated") return "Seu dia foi salvo e o índice foi recalculado.";
  if (update?.status === "historical") return "Dia salvo no histórico. Seu índice atual foi mantido porque já existe um check-in mais recente.";
  if (update?.status === "unchanged") return "Seu dia foi salvo. As informações usadas no cálculo permaneceram iguais.";
  if (update?.status === "disabled") return "Seu dia foi salvo. A atualização pelos check-ins está desativada neste ambiente.";
  if (update?.status === "needs_context") return "Seu dia foi salvo. Revise sua rotina para continuar atualizando o índice.";
  return "Seu dia foi salvo, mas a atualização do índice ficou pendente. Você pode tentar o cálculo novamente.";
}

export function dailyDate(value?: string | null) {
  const key = value?.slice(0, 10);
  return key && isCalendarDay(key)
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(`${key}T12:00:00`)) : "Data não informada";
}

export function isCalendarDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

export function shiftCalendarDay(value: string, days: number) {
  const day = new Date(`${value}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function calculationDate(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone }).format(new Date(value));
}
