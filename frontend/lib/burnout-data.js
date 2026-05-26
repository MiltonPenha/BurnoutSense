export const STORAGE_KEYS = {
  records: "burnoutsense.v2.records",
  profile: "burnoutsense.v2.profile"
};

export const defaultProfile = {
  name: "estudante",
  email: "",
  emailAlerts: true,
  dailyReminder: true
};

export const defaultRecords = [];

export const moods = [
  { name: "Feliz", emoji: "😊" },
  { name: "Calmo", emoji: "😌" },
  { name: "Ansioso", emoji: "😰" },
  { name: "Triste", emoji: "😔" },
  { name: "Irritado", emoji: "😠" },
  { name: "Cansado", emoji: "😴" },
  { name: "Desmotivado", emoji: "😞" }
];

export function calculateRisk(record) {
  const stressWeight = record.stress * 0.32;
  const tirednessWeight = record.tiredness * 0.22;
  const sleepPenalty = Math.max(0, 7 - record.sleepHours) * 0.55;
  const qualityPenalty = Math.max(0, 7 - record.sleepQuality) * 0.24;
  const taskPenalty = Math.min(record.pendingTasks, 6) * 0.22;
  const deliveryPenalty = record.importantDelivery ? 0.9 : 0;
  const score = Math.round(stressWeight + tirednessWeight + sleepPenalty + qualityPenalty + taskPenalty + deliveryPenalty);

  if (score >= 8) {
    return { score, label: "Risco alto", tone: "danger" };
  }

  if (score >= 5) {
    return { score, label: "Risco moderado", tone: "warning" };
  }

  return { score, label: "Risco baixo", tone: "success" };
}

export function sortRecords(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date));
}

export function formatDateShort(date) {
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  }).format(parsed);
}

export function formatDateLong(date) {
  return date;
}

export function buildAlerts(record) {
  const alerts = [];

  if (record.stress >= 8) {
    alerts.push("Nivel de estresse muito alto");
  }

  if (record.tiredness >= 8) {
    alerts.push("Cansaco elevado");
  }

  if (record.sleepHours < 6 || record.sleepQuality < 5) {
    alerts.push("Sono abaixo do recomendado");
  }

  if (record.pendingTasks >= 4) {
    alerts.push("Muitas tarefas academicas pendentes");
  }

  return alerts.length ? alerts : ["Nenhum alerta preventivo para o registro mais recente"];
}
