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

export function sortRecords(records) {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
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
