export const STORAGE_KEYS = {
  records: "burnoutsense.v2.records",
  profile: "burnoutsense.v2.profile"
};

export const defaultProfile = {
  name: "estudante",
  email: "",
  course: "",
  semester: "",
  emailAlerts: true,
  dailyReminder: true,
  avatarUrl: "",
  theme: "light"
};

export const defaultRecords = [];

export const moods = [
  { name: "Feliz", emoji: "😊", icon: "happy" },
  { name: "Calmo", emoji: "😌", icon: "calm" },
  { name: "Ansioso", emoji: "😟", icon: "anxious" },
  { name: "Triste", emoji: "😔", icon: "sad" },
  { name: "Irritado", emoji: "😤", icon: "angry" },
  { name: "Cansado", emoji: "😴", icon: "tired" },
  { name: "Desmotivado", emoji: "😞", icon: "unmotivated" }
];

export function calculateRisk(record) {
  const stressWeight = record.stress * 0.32;
  const tirednessWeight = record.tiredness * 0.22;
  const sleepPenalty = Math.max(0, 7 - record.sleepHours) * 0.55;
  const qualityPenalty = Math.max(0, 7 - record.sleepQuality) * 0.24;
  const academicPressure = Math.max(0, (record.examPressure ?? 5) - 5) * 0.35;
  const screenPenalty = Math.max(0, (record.screenTime ?? 0) - 8) * 0.18;
  const score = Math.min(10, Math.max(1, Math.round(stressWeight + tirednessWeight + sleepPenalty + qualityPenalty + academicPressure + screenPenalty)));

  if (score >= 8) {
    return { score, label: "Risco alto", tone: "danger" };
  }

  if (score >= 5) {
    return { score, label: "Risco moderado", tone: "warning" };
  }

  return { score, label: "Risco baixo", tone: "success" };
}

export function riskFromBackendResult(result) {
  if (!result?.riskLevel) {
    return null;
  }

  const normalizedRiskLevel = String(result.riskLevel).toUpperCase();
  const confidence = typeof result.confidence === "number" ? result.confidence : null;
  const confidencePercent = confidence === null ? null : Math.round(confidence * 100);
  const mainFactors = Array.isArray(result.mainFactors) ? result.mainFactors : [];
  const backendRiskScore = typeof result.riskScore === "number" ? result.riskScore : null;
  const base = {
    confidence,
    confidencePercent,
    mainFactors,
    modelUsed: result.modelUsed ?? result.modelVersion ?? "",
    source: "backend"
  };

  if (normalizedRiskLevel === "HIGH") {
    return { ...base, score: normalizeRiskScore(backendRiskScore ?? scoreFromRiskLevel(normalizedRiskLevel, confidence, mainFactors)), label: "Risco alto", tone: "danger" };
  }

  if (normalizedRiskLevel === "MEDIUM") {
    return { ...base, score: normalizeRiskScore(backendRiskScore ?? scoreFromRiskLevel(normalizedRiskLevel, confidence, mainFactors)), label: "Risco moderado", tone: "warning" };
  }

  if (normalizedRiskLevel === "LOW") {
    return { ...base, score: normalizeRiskScore(backendRiskScore ?? scoreFromRiskLevel(normalizedRiskLevel, confidence, mainFactors)), label: "Risco baixo", tone: "success" };
  }

  return null;
}

function normalizeRiskScore(score) {
  const number = Number(score);

  if (Number.isNaN(number)) {
    return 5;
  }

  return Math.round(Math.min(10, Math.max(1, number)));
}

function scoreFromRiskLevel(riskLevel, confidence, mainFactors = []) {
  const effectiveConfidence = typeof confidence === "number" ? confidence : 0.5;
  const chanceFloor = 1 / 3;
  const confidenceRatio = Math.min(1, Math.max(0, (effectiveConfidence - chanceFloor) / (1 - chanceFloor)));
  const factorAdjustment = Math.min(0.4, mainFactors.length * 0.1);

  if (riskLevel === "LOW") {
    return Math.min(4, 4 - 3 * confidenceRatio + factorAdjustment);
  }

  if (riskLevel === "MEDIUM") {
    return Math.min(7, 5 + 2 * confidenceRatio + factorAdjustment);
  }

  if (riskLevel === "HIGH") {
    return Math.min(10, 8 + 2 * confidenceRatio + factorAdjustment);
  }

  return 5;
}

export function getRecordRisk(record) {
  if (!record) {
    return null;
  }

  return riskFromBackendResult(record?.backendResult) ?? { ...calculateRisk(record), source: "local" };
}

export function mainFactorsForRecord(record) {
  const factors = record?.backendResult?.mainFactors;

  if (Array.isArray(factors) && factors.length > 0) {
    return factors;
  }

  if (!record) {
    return [];
  }

  return buildAlerts(record);
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
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

export function formatHours(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return "0 horas";
  }

  const formatted = Number.isInteger(number) ? String(number) : String(number).replace(".", ",");
  return `${formatted} ${number === 1 ? "hora" : "horas"}`;
}

export function emojiForMood(mood) {
  return moods.find((item) => item.name === mood)?.emoji ?? "🙂";
}

export function moodIconFor(mood) {
  return moods.find((item) => item.name === mood)?.icon ?? "calm";
}

export function buildAlerts(record) {
  const alerts = [];

  if (record.stress >= 8) {
    alerts.push("Nível de estresse muito alto");
  }

  if (record.tiredness >= 8) {
    alerts.push("Cansaço elevado");
  }

  if (record.sleepHours < 6 || record.sleepQuality < 5) {
    alerts.push("Sono abaixo do recomendado");
  }

  if (record.pendingTasks >= 4) {
    alerts.push("Muitas tarefas acadêmicas pendentes");
  }

  if ((record.examPressure ?? 0) >= 8) {
    alerts.push("Pressão acadêmica elevada");
  }

  if ((record.socialSupport ?? 6) <= 3) {
    alerts.push("Baixo suporte social percebido");
  }

  return alerts.length ? alerts : ["Nenhum alerta preventivo para o registro mais recente"];
}
